import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MapIcon, SettingsIcon, StatsIcon } from '../components/NavIcons';
import ClassFilterPanel from '../components/ClassFilterPanel';
import DetectionCallout from '../components/DetectionCallout';
import AddDetectionFAB from '../components/AddDetectionFAB';
import AddDetectionSheet from '../components/AddDetectionSheet';
import { useLocationPref } from "../LocationContext";
import { useTheme } from "../ThemeContext";
import { defaultClassFilter } from "../constants/detectionClasses";
import { createDetection, fetchDetectionsAsGeoJSON } from "../services/firestoreService";

const MAPBOX_TOKEN = "pk.eyJ1IjoiZGlydGlzaHV0IiwiYSI6ImNtbDgzaTl3MDAzZTYzZW9id2FlMjEyN3AifQ.4IaAvo6SoKCI3VbmYNyujg";

Mapbox.setAccessToken(MAPBOX_TOKEN);
Mapbox.setTelemetryEnabled(false);

/** How often to auto-refresh detections from the API (ms) */
const REFRESH_INTERVAL_MS = 15_000;

const ROUTE_BUFFER_METERS = 40; // distance of detection for it to be on path
const DETECTION_PENALTY_SECONDS = 30; // detection adds 30s penalty to route

const MANEUVER_ADVANCE_METERS = 30; // advance route within 30 meters of maneuver
const MANEUVER_DISPLAY_MAX_METERS = 3000;

function deg2rad(d) {
    return (d * Math.PI) / 180;
}

function haversineMeters(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const [lon1, lat1] = a;
    const [lon2, lat2] = b;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLon / 2);
    const aa = s1 * s1 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * s2 * s2;
    return 2 * R * Math.asin(Math.sqrt(aa));
}

function formatDistance(meters) {
    const m = Math.max(0, Math.round(Number(meters) || 0));
    if (m < 1000) return `${m} m`;
    const km = m / 1000;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

function pointToPolylineMeters(point, lineCoords) {
    if (!lineCoords || lineCoords.length < 2) return Infinity;
    const [px, py] = point;

    const latRad = deg2rad(py);
    const mxPerDegLat = 111132;
    const mxPerDegLon = 1111320 * Math.cos(latRad);

    const pX = px * mxPerDegLon;
    const pY = py * mxPerDegLat;

    let best = Infinity;

    for (let i = 0; i < lineCoords.length - 1; i++) {
        const [ax, ay] = lineCoords[i];
        const [bx, by] = lineCoords[i + 1];

        const aX = ax * mxPerDegLon;
        const aY = ay * mxPerDegLat;
        const bX = bx * mxPerDegLon;
        const bY = by * mxPerDegLat;

        const abX = bX - aX;
        const abY = bY - aY;
        const apX = pX - aX;
        const apY = pY - aY;

        const abLen2 = abX * abX + abY * abY;
        const t = abLen2 === 0 ? 0 : Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLen2));

        const projX = aX + t * abX;
        const projY = aY + t * abY;

        const dx = pX - projX;
        const dy = pY - projY;

        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) best = d;
    }
    return best;
}

function countDetectionsNearRoute(routeCoords, detectionFeatures, bufferMeters) {
    if (!routeCoords || routeCoords.length < 2) return 0;
    if (!detectionFeatures || detectionFeatures.length === 0) return 0;

    let count = 0;
    for (const f of detectionFeatures) {
        const c = f?.geometry?.coordinates;
        if (!c) continue;
        const d = pointToPolylineMeters(c, routeCoords);
        if (d <= bufferMeters) count++;
    }
    return count;
}

async function geocodeAddressSingle(address) {
    const q = encodeURIComponent(address.trim());
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    const json = await res.json();
    const feature = json?.features?.[0];
    if (!feature?.center) throw new Error("No results for that address");
    return feature.center;
}

async function geocodeAutocomplete(query, proximity) {
    const q = encodeURIComponent(query.trim());
    const prox = proximity ? `&proximity=${proximity[0]},${proximity[1]}` : "";
    const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json` +
        `?access_token=${MAPBOX_TOKEN}` +
        `&autocomplete=true&limit=6&types=address,place` +
        prox;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Autocomplete failed (${res.status})`);
    const json = await res.json();
    return json?.features ?? [];
}

async function fetchDirections(origin, destination) {
    const o = `${origin[0]},${origin[1]}`;
    const d = `${destination[0]},${destination[1]}`;

    const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${o};${d}` +
        `?alternatives=true` +
        `&geometries=geojson` +
        `&overview=full` +
        `&steps=true` +
        `&banner_instructions=true` +
        `&voice_instructions=true` +
        `&access_token=${MAPBOX_TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions failed (${res.status})`);
    const json = await res.json();
    const routes = json?.routes ?? [];
    if (routes.length === 0) throw new Error("No route found");
    return routes;
}

function formatDurationHM(totalSeconds) {
    const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const totalMinutes = Math.round(sec / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} hr`;
    return `${hours} hr ${minutes} min`;
}

function formatArrivalTimeFromNow(durationSeconds) {
    const sec = Math.max(0, Math.round(Number(durationSeconds) || 0));
    const eta = new Date(Date.now() + sec * 1000);
    return eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function MapScreen({ navigation }) {
    const { theme } = useTheme();
    const { locationEnabled } = useLocationPref();

    const cameraRef = useRef(null);
    const watchSubRef = useRef(null);

    const [hasPermission, setHasPermission] = useState(false);
    const [servicesEnabled, setServicesEnabled] = useState(true);

    const [userCoords, setUserCoords] = useState(null);
    const [locError, setLocError] = useState("");
    const [mapError, setMapError] = useState("");

    // Detection layer state
    const [detectionGeoJSON, setDetectionGeoJSON] = useState(null);
    const [classFilter, setClassFilter] = useState(defaultClassFilter);
    const [selectedFeature, setSelectedFeature] = useState(null);
    const [loadingDetections, setLoadingDetections] = useState(true);

    // Add-detection state
    const [addMode, setAddMode] = useState(false);
    const [addCoordinate, setAddCoordinate] = useState(null);
    const [showAddSheet, setShowAddSheet] = useState(false);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState([]);
    const [suggestLoading, setSuggestLoading] = useState(false);

    // Navigation state
    const [addressQuery, setAddressQuery] = useState("");
    const [destinationCoords, setDestinationCoords] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [routeError, setRouteError] = useState("");
    const [routeSummary, setRouteSummary] = useState(null);
    const [routeGeoJSON, setRouteGeoJSON] = useState(null);
    const [addressLocked, setAddressLocked] = useState(false);

    // Turn-by-turn state
    const [navActive, setNavActive] = useState(false);
    const [navSteps, setNavSteps] = useState([]);
    const [navStepIdx, setNavStepIdx] = useState(0);

    // Filtered GeoJSON -- recomputed when filter or data changes
    const filteredGeoJSON = useMemo(() => {
        if (!detectionGeoJSON) return null;
        const filtered = detectionGeoJSON.features.filter((f) => {
            const classes = f.properties.classes ?? [];
            return classes.some((c) => classFilter[c]);
        });
        return { type: "FeatureCollection", features: filtered };
    }, [detectionGeoJSON, classFilter]);

    // ── Detections loading ──────────────────────────────────────
    const initialFitDone = useRef(false);

    const loadDetections = useCallback(async (showSpinner = false) => {
        if (showSpinner) setLoadingDetections(true);
        try {
            const data = await fetchDetectionsAsGeoJSON();
            setDetectionGeoJSON(data);

            // Fit camera to all detections on first load
            if (!initialFitDone.current && data.features.length > 0) {
                initialFitDone.current = true;
                const lons = data.features.map((f) => f.geometry.coordinates[0]);
                const lats = data.features.map((f) => f.geometry.coordinates[1]);
                const sw = [Math.min(...lons), Math.min(...lats)];
                const ne = [Math.max(...lons), Math.max(...lats)];
                if (cameraRef.current?.fitBounds) {
                    cameraRef.current.fitBounds(ne, sw, 60, 700);
                }
            }
        } catch (e) {
            console.warn("Failed to fetch detections:", e);
        } finally {
            if (showSpinner) setLoadingDetections(false);
        }
    }, []);

    // Initial fetch on mount
    useEffect(() => {
        loadDetections(true);
    }, [loadDetections]);

    // Auto-refresh every 15 s (silent — no spinner)
    useEffect(() => {
        const id = setInterval(() => loadDetections(false), REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [loadDetections]);

    // ── Autocomplete effect ──────────────────────────────────────

    useEffect(() => {
        let cancelled = false;
        const q = addressQuery.trim();

        if (addressLocked || navActive) {
            setSuggestions([]);
            setSuggestLoading(false);
            return;
        }

        if (q.length < 3) {
            setSuggestions([]);
            setSuggestLoading(false);
            return;
        }

        setSuggestLoading(true);

        const timeoutId = setTimeout(async () => {
            try {
                const results = await geocodeAutocomplete(q, userCoords);
                if (!cancelled) setSuggestions(results);
            } catch (e) {
                if (!cancelled) setSuggestions([]);
                console.warn("Autocomplete error: ", e);
            } finally {
                if (!cancelled) setSuggestLoading(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [addressQuery, userCoords, addressLocked, navActive]);

    // ── Location helpers ─────────────────────────────────

    const isGoodFix = (loc) => {
        if (!loc?.coords) return false;
        const acc = typeof loc.coords.accuracy === "number" ? loc.coords.accuracy : 9999;
        if (userCoords) return acc <= 200;
        return acc <= 500;
    };

    const stopWatching = async () => {
        try {
            if (watchSubRef.current) {
                watchSubRef.current.remove();
                watchSubRef.current = null;
            }
        } catch (e) { /* ignore */ }
    };

    const startWatching = async () => {
        setLocError("");
        setMapError("");

        const svc = await Location.hasServicesEnabledAsync();
        setServicesEnabled(svc);
        if (!svc) {
            setLocError("Location services are OFF on the device. Turn them on to use the map.");
            return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === "granted";
        setHasPermission(granted);

        if (!granted) {
            setLocError("Location permission is OFF. Enable it to show your real position.");
            return;
        }

        try {
            const last = await Location.getLastKnownPositionAsync({});
            if (last?.coords) {
                setUserCoords([last.coords.longitude, last.coords.latitude]);
            }
        } catch (e) { /* ignore */ }

        try {
            const current = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
                maximumAge: 10000,
                timeout: 20000,
            });

            if (isGoodFix(current)) {
                setUserCoords([current.coords.longitude, current.coords.latitude]);
            }
        } catch (e) {
            setLocError(String(e?.message ?? e));
        }

        await stopWatching();

        try {
            const sub = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 2000,
                    distanceInterval: 5,
                    mayShowUserSettingsDialog: true,
                },
                (loc) => {
                    if (!isGoodFix(loc)) return;
                    setUserCoords([loc.coords.longitude, loc.coords.latitude]);
                }
            );
            watchSubRef.current = sub;
        } catch (e) {
            setLocError(String(e?.message ?? e));
        }
    };

    useEffect(() => {
        (async () => {
            if (!locationEnabled) {
                await stopWatching();
                setHasPermission(false);
                setLocError("");
                return;
            }
            await startWatching();
        })();
        return () => { stopWatching(); };
    }, [locationEnabled]);

    // ── Turn-by-turn auto-advance when moving ────────────────────────────────────
    const currentStep = navSteps?.[navStepIdx] ?? null;
    const nextStep = navSteps?.[navStepIdx + 1] ?? null;
    const currentManeuverLoc = currentStep?.maneuver?.location ?? null;
    const distToManeuver = useMemo(() => {
        if (!navActive || !userCoords || !currentManeuverLoc) return null;
        const d = haversineMeters(userCoords, currentManeuverLoc);
        if (!Number.isFinite(d)) return null;
        return Math.min(d, MANEUVER_DISPLAY_MAX_METERS);
    }, [navActive, userCoords, currentManeuverLoc]);

    useEffect(() => {
        if (!navActive) return;
        if (!userCoords) return;
        if (!currentManeuverLoc) return;

        const d = haversineMeters(userCoords, currentManeuverLoc);
        if (!Number.isFinite(d)) return;

        if (d <= MANEUVER_ADVANCE_METERS) {
            setNavStepIdx((idx) => {
                const nextIdx = idx + 1;
                if (nextIdx >= navSteps.length) {
                    setNavActive(false);
                    return idx;
                }
                return nextIdx;
            });
        }
    }, [navActive, userCoords, currentManeuverLoc, navSteps.length]);

    // Handle marker/cluster press on the ShapeSource
    const onDetectionPress = useCallback((e) => {
        const feature = e?.features?.[0];
        if (!feature) return;

        // If it's a cluster, zoom into it
        if (feature.properties?.cluster === true || feature.properties?.point_count) {
            const coords = feature.geometry?.coordinates;
            if (coords && cameraRef.current?.setCamera) {
                cameraRef.current.setCamera({
                    centerCoordinate: coords,
                    zoomLevel: (feature.properties?.clusterExpansionZoom ?? 12) + 1,
                    animationDuration: 500,
                });
            }
            return;
        }

        // Individual detection
        setSelectedFeature(feature);
    }, []);

    // ── Navigation actions ─────────────────────────────────────────────────
    const clearRoute = useCallback(() => {
        setAddressQuery("");
        setDestinationCoords(null);
        setRouteGeoJSON(null);
        setRouteSummary(null);
        setRouteError("");
        setSuggestions([]);
        setAddressLocked(false);

        setNavActive(false);
        setNavSteps([]);
        setNavStepIdx(0);
    }, []);

    const endNav = useCallback(() => {
        setNavActive(false);
    }, []);

    const buildBestRoute = useCallback(
        async (destOverride = null, startNav = true) => {
            if (!userCoords) {
                setRouteError("Waiting for your location...");
                return;
            }

            const typed = addressQuery.trim();
            if (!destOverride && !typed) {
                setRouteError("Type an address first.");
                return;
            }

            setRouteLoading(true);
            setRouteError("");
            setSelectedFeature(null);

            try {
                const dest = destOverride ?? (await geocodeAddressSingle(typed));
                setDestinationCoords(dest);

                const routes = await fetchDirections(userCoords, dest);
                const detectionFeatures = filteredGeoJSON?.features ?? [];

                let best = null;

                for (const r of routes) {
                    const coords = r?.geometry?.coordinates ?? [];
                    const detectionsCount = countDetectionsNearRoute(
                        coords,
                        detectionFeatures,
                        ROUTE_BUFFER_METERS
                    );

                    const durationSec = r.duration ?? 0;
                    const score = durationSec + detectionsCount * DETECTION_PENALTY_SECONDS;

                    const steps = r?.legs?.[0]?.steps ?? [];

                    if (!best || score < best.score) {
                        best = {
                            score,
                            durationSec,
                            distanceMeters: r.distance ?? 0,
                            detectionsCount,
                            coords,
                            steps,
                        };
                    }
                }

                if (!best) throw new Error("No route candidates to score.");

                const routeFC = {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            properties: {},
                            geometry: {
                                type: "LineString",
                                coordinates: best.coords,
                            },
                        },
                    ],
                };

                setRouteGeoJSON(routeFC);

                const distanceMi = (best.distanceMeters / 1609.344).toFixed(1);

                setRouteSummary({
                    durationText: formatDurationHM(best.durationSec),
                    durationSec: best.durationSec,
                    distanceText: `${distanceMi} mi`,
                    distanceMi: Number(distanceMi),
                    detectionsCount: best.detectionsCount,
                });

                setSuggestions([]);

                setNavSteps(best.steps ?? []);
                setNavStepIdx(0);
                setNavActive(startNav && (best.steps?.length ?? 0) > 0);

                if (cameraRef.current?.fitBounds && best.coords.length > 1) {
                    const lons = best.coords.map((c) => c[0]);
                    const lats = best.coords.map((c) => c[1]);
                    const sw = [Math.min(...lons), Math.min(...lats)];
                    const ne = [Math.max(...lons), Math.max(...lats)];
                    cameraRef.current.fitBounds(ne, sw, 80, 700);
                }
            } catch (e) {
                setRouteError(String(e?.message ?? e));
                console.warn("Route build failed: ", e);
            } finally {
                setRouteLoading(false);
            }
        },
        [userCoords, addressQuery, filteredGeoJSON]
    );

    const onPickSuggestion = useCallback(
        (feature) => {
            Keyboard.dismiss();

            const name = feature?.place_name ?? "";
            const center = feature?.center;

            setAddressLocked(true);
            setAddressQuery(name);
            setSuggestions([]);

            if (center && Array.isArray(center) && center.length === 2) {
                buildBestRoute(center, true);
            }
        },
        [buildBestRoute]
    );

    // ── Banner logic ─────────────────────────────────────────────────
    const showBanner =
        !locationEnabled ||
        !servicesEnabled ||
        (locationEnabled && !hasPermission) ||
        !!locError ||
        !!mapError;

    const bannerText = !locationEnabled
        ? "Location is OFF in Settings. Turn it ON to show your position."
        : !servicesEnabled
            ? "Location services are OFF on this device. Turn them on."
            : !hasPermission
                ? "Location permission is OFF. Enable it to show your position."
                : locError || mapError;

    const stepInstruction =
        currentStep?.maneuver?.instruction ||
        (navActive ? "Continue..." : null);

    const nextInstruction = nextStep?.maneuver?.instruction || null;

    const arrivalText =
        routeSummary?.durationSec != null
        ? formatArrivalTimeFromNow(routeSummary.durationSec)
        : null;

    // ── Render ───────────────────────────────────────────────────────
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.mapWrap}>
                <Mapbox.MapView
                    style={styles.map}
                    styleURL={Mapbox.StyleURL.Street}
                    logoEnabled={false}
                    attributionEnabled={false}
                    projection="globe"
                    compassEnabled
                    scaleBarEnabled
                    onDidFailLoadingMap={(e) => setMapError(JSON.stringify(e?.nativeEvent ?? e))}
                    onPress={(e) => {
                        if (addMode) {
                            const coords = e?.geometry?.coordinates;
                            if (coords) {
                                setAddCoordinate(coords);
                                setShowAddSheet(true);
                                setAddMode(false);
                            }
                        } else {
                            setSelectedFeature(null);
                        }
                    }}
                >
                    <Mapbox.Camera
                        ref={cameraRef}
                        zoomLevel={12}
                        centerCoordinate={userCoords ?? [-92.6379, 32.5232]}
                    />

                    {locationEnabled && hasPermission && servicesEnabled && (
                        <Mapbox.LocationPuck puckBearingEnabled puckBearing="heading" />
                    )}

                    {/* Route line */}
                    {routeGeoJSON && (
                        <Mapbox.ShapeSource id="route" shape={routeGeoJSON}>
                            <Mapbox.LineLayer
                                id="route-line"
                                style={{
                                    lineWidth: 5,
                                    lineJoin: "round",
                                    lineCap: "round",
                                    lineColor: "#2E86FF",
                                    lineOpacity: 0.85,
                                }}
                            />
                        </Mapbox.ShapeSource>
                    )}

                    {/* Destination marker */}
                    {destinationCoords && (
                        <Mapbox.PointAnnotation id="dest" coordinate={destinationCoords} />
                    )}

                    {/* Detection markers with clustering */}
                    {filteredGeoJSON && filteredGeoJSON.features.length > 0 && (
                        <Mapbox.ShapeSource
                            id="detections"
                            shape={filteredGeoJSON}
                            cluster
                            clusterRadius={50}
                            clusterMaxZoomLevel={14}
                            onPress={onDetectionPress}
                        >
                            {/* Cluster circles */}
                            <Mapbox.CircleLayer
                                id="cluster-circles"
                                filter={['has', 'point_count']}
                                style={{
                                    circleRadius: [
                                        'step', ['get', 'point_count'],
                                        18, 10, 24, 50, 30,
                                    ],
                                    circleColor: '#71B07B',
                                    circleStrokeWidth: 2,
                                    circleStrokeColor: '#ffffff',
                                    circleOpacity: 0.85,
                                }}
                            />
                            {/* Cluster count labels */}
                            <Mapbox.SymbolLayer
                                id="cluster-count"
                                filter={['has', 'point_count']}
                                style={{
                                    textField: ['get', 'point_count_abbreviated'],
                                    textSize: 13,
                                    textColor: '#ffffff',
                                    textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                                    textAllowOverlap: true,
                                }}
                            />
                            {/* Individual detection circles */}
                            <Mapbox.CircleLayer
                                id="detection-circles"
                                filter={['!', ['has', 'point_count']]}
                                style={{
                                    circleRadius: 8,
                                    circleColor: ['get', 'markerColor'],
                                    circleStrokeWidth: 2,
                                    circleStrokeColor: '#ffffff',
                                    circleOpacity: 0.9,
                                }}
                            />
                        </Mapbox.ShapeSource>
                    )}

                    {/* Callout for selected detection */}
                    {selectedFeature && (
                        <Mapbox.MarkerView
                            coordinate={selectedFeature.geometry.coordinates}
                            anchor={{ x: 0.5, y: 1.4 }}
                        >
                            <DetectionCallout feature={selectedFeature} />
                        </Mapbox.MarkerView>
                    )}
                </Mapbox.MapView>

                {/* Address Search UI + Suggestions */}
                {!navActive && (
                    <View style={styles.searchShell}>
                        <View style={styles.searchRow}>
                            <TextInput
                                value={addressQuery}
                                onChangeText={(t) => {
                                    setAddressLocked(false);
                                    setAddressQuery(t);
                                    setRouteError("");
                                }}
                                placeholder="Enter destination address..."
                                placeholderTextColor="#9aa0a6"
                                style={styles.searchInput}
                                autoCorrect={false}
                                autoCapitalize="none"
                                returnKeyType="go"
                                onSubmitEditing={() => {
                                    Keyboard.dismiss();
                                    setAddressLocked(true);
                                    buildBestRoute(null, true);
                                }}
                            />

                            <TouchableOpacity
                                style={[styles.searchGo, { opacity: routeLoading ? 0.6 : 1 }]}
                                activeOpacity={0.85}
                                disabled={routeLoading}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setAddressLocked=(true);
                                    buildBestRoute(null, true);
                                }}
                            >
                                {routeLoading ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <Text style={styles.searchGoText}>Go</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.searchClear}
                                activeOpacity={0.85}
                                onPress={clearRoute}
                            >
                                <Text style={styles.searchClearText}>Clear</Text>
                            </TouchableOpacity>
                        </View>

                        {!addressLocked && (suggestLoading || suggestions.length > 0) && (
                            <View style={styles.suggestBox}>
                                {suggestLoading && suggestions.length === 0 ? (
                                    <View style={styles.suggestLoadingRow}>
                                        <ActivityIndicator size="small" color="#ffffff" />
                                        <Text style={styles.suggestLoadingText}>Searching...</Text>
                                    </View>
                                ) : (
                                    <FlatList
                                        data={suggestions}
                                        keyExtractor={(item, idx) =>
                                            item.id ?? item.place_name ?? String(idx)
                                        }
                                        keyboardShouldPersistTaps="handled"
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                style={styles.suggestItem}
                                                activeOpacity={0.85}
                                                onPress={() => onPickSuggestion(item)}
                                            >
                                                <Text style={styles.suggestText} numberOfLines={2}>
                                                    {item.place_name}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                )}
                            </View>
                        )}
                    </View>
                )}

                {navActive && (
                    <View style={styles.topNavBanner}>
                         <View style={styles.topNavLeft}>
                            <View style={styles.turnIcon}>
                                <Text style={styles.turnIconText}>↻</Text>
                            </View>
                            <View style={styles.topNavTextWrap}>
                                <Text style={styles.topNavTitle} numberOfLines={2}>
                                    {stepInstruction || "Continue..."}
                                </Text>
                                {!!nextInstruction && (
                                    <Text style={styles.topNavSubtitle} numberOfLines={1}>
                                        Next: {nextInstruction}
                                    </Text>
                                )}
                            </View>
                         </View>

                         <TouchableOpacity
                            style={styles.topNavEnd}
                            activeOpacity={0.85}
                            onPress={endNav}
                         >
                            <Text style={styles.topNavEndText}>End</Text>
                         </TouchableOpacity>
                    </View>
                )}

                {navActive && routeSummary && (
                    <View style={styles.bottomEtaCard}>
                        <View style={styles.bottomHandle} />
                        <View style={styles.etaRow}>
                            <View style={styles.etaCol}>
                                <Text style={styles.etaValue}>{arrivalText ?? "--:--"}</Text>
                                <Text style={styles.etaLabel}>arrival</Text>
                            </View>

                            <View style={styles.etaCol}>
                                <Text style={styles.etaValue}>{routeSummary.durationText}</Text>
                                <Text style={styles.etaLabel}>time</Text>
                            </View>

                            <View style={styles.etaCol}>
                                <Text style={styles.etaValue}>{routeSummary.distanceText}</Text>
                                <Text style={styles.etaLabel}>distance</Text>
                            </View>
                        </View>

                        <View style={styles.etaMetaRow}>
                            <Text style={styles.etaMetaText}>
                                {routeSummary.detectionsCount} detections on path
                                {distToManeuver != null ? ` • next in ${formatDistance(distToManeuver)}` : ""}
                            </Text>
                        </View>
                    </View>
                )}

                {!navActive && routeSummary && (
                    <View style={styles.routeSummary}>
                        <Text style={styles.routeSummaryText}>
                            Best route: {routeSummary.durationText} • {routeSummary.distanceMi} mi •{" "}
                            {routeSummary.detectionsCount} detections on path
                        </Text>
                    </View>
                )}

                {routeError ? (
                    <View style={styles.routeError}>
                        <Text style={styles.routeErrorText}>{routeError}</Text>
                    </View>
                ) : null}

                {loadingDetections && (
                    <View style={styles.loadingBadge}>
                        <ActivityIndicator size="small" color="#71B07B" />
                        <Text style={styles.loadingText}>Loading detections...</Text>
                    </View>
                )}

                {!loadingDetections && detectionGeoJSON && (
                    <TouchableOpacity
                        style={styles.countBadge}
                        activeOpacity={0.7}
                        onPress={() => loadDetections(true)}
                    >
                        <Text style={styles.countText}>
                            {filteredGeoJSON?.features?.length ?? 0} detections
                        </Text>
                        <Text style={styles.refreshIcon}>↻</Text>
                    </TouchableOpacity>
                )}

                {showBanner && (
                    <View style={[styles.permissionBanner, { backgroundColor: theme.card ?? "#222" }]}>
                        <Text style={[styles.permissionText, { color: "#fff" }]}>{bannerText}</Text>
                        {locationEnabled && !hasPermission && (
                            <Text style={[styles.permissionSubText, { color: "#fff" }]}>
                                Tip: Android Settings → Apps → Curby → Permissions → Location → Allow
                            </Text>
                        )}
                    </View>
                )}

                <ClassFilterPanel classFilter={classFilter} onFilterChange={setClassFilter} />

                {addMode && (
                    <View style={styles.addModeBanner}>
                        <Text style={styles.addModeText}>Tap map to place detection</Text>
                    </View>
                )}

                <AddDetectionFAB active={addMode} onPress={() => setAddMode((v) => !v)} />

                <AddDetectionSheet
                    visible={showAddSheet}
                    coordinate={addCoordinate}
                    onSubmit={async (data) => {
                        setShowAddSheet(false);
                        setAddCoordinate(null);
                        try {
                            await createDetection({
                                ...data,
                                sourceDeviceId: "android_app",
                                confidence: 1.0,
                            });
                            await loadDetections(true);
                        } catch (e) {
                            console.warn("Failed to create detection: ", e);
                        }
                    }}
                    onCancel={() => {
                        setShowAddSheet(false);
                        setAddCoordinate(null);
                    }}
                />
            </View>

            <View style={styles.bottomBar}>
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.button}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate("Stats")}
                    >
                        <StatsIcon size={20} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.button}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate("Map")}
                    >
                        <MapIcon size={20} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.button}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate("Settings")}
                    >
                        <SettingsIcon size={20} color="#ffffff" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    mapWrap: {
        flex: 1,
    },

    // Search section
    searchShell: {
        position: "absolute",
        top: 80,
        left: 14,
        right: 14,
        backgroundColor: "#1f1f1f",
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 10,
        elevation: 6,
    },
    searchRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    searchInput: {
        flex: 1,
        color: "#fff",
        fontSize: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
    searchGo: {
      backgroundColor: "#2E86FF",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12
    },
    searchGoText: {
        color: "#fff",
        fontWeight: "800",
    },
    searchClear: {
        backgroundColor: "rgba(255,255,255,0.08)",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
    },
    searchClearText: {
        color: "#fff",
        fontWeight: "700",
    },

    // Suggestions
    suggestBox: {
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.06)",
        maxHeight: 220,
    },
    suggestItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(255,255,255,0.10)",
    },
    suggestText: {
        color: "#fff",
        fontSize: 13,
    },
    suggestLoadingRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 12,
        gap: 8,
    },
    suggestLoadingText: {
        color: "rgba(255,255,255,0.85)",
        fontSize: 13,
    },

    // Top banner
    topNavBanner: {
        position: "absolute",
        top: 80,
        left: 14,
        right: 14,
        backgroundColor: "rgba(20,20,20,0.92)",
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 12,
        elevation: 10,
    },
    topNavLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    turnIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.10)",
        alignItems: "center",
        justifyContent: "center",
    },
    turnIconText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "900",
    },
    topNavTextWrap: {
        flex: 1,
    },
    topNavTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "900",
    },
    topNavSubtitle: {
        marginTop: 4,
        color: "rgba(255,255,255,0.75)",
        fontSize: 12,
        fontWeight: "700",
    },
    topNavEnd: {
        position: "absolute",
        right: 12,
        top: 12,
        backgroundColor: "rgba(255,255,255,0.10)",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
    },
    topNavEndText: {
        color: "#fff",
        fontWeight: "900",
    },

    // ETA card
    bottomEtaCard: {
        position: "absolute",
        left: 14,
        right: 14,
        bottom: 120,
        backgroundColor: "rgba(245,245,245,0.96)",
        borderRadius: 22,
        paddingTop: 10,
        paddingBottom: 12,
        paddingHorizontal: 14,
        elevation: 12,
    },
    bottomHandle: {
        alignSelf: "center",
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: "rgba(0,0,0,0.15)",
        marginBottom: 10,
    },
    etaRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 8,
    },
    etaCol: {
        alignItems: "center",
        flex: 1,
    },
    etaValue: {
        color: "#111",
        fontSize: 18,
        fontWeight: "900",
    },
    etaLabel: {
        marginTop: 2,
        color: "rgba(0,0,0,0.55)",
        fontSize: 12,
        fontWeight: "800",
        textTransform: "lowercase",
    },
    etaMetaRow: {
    marginTop: 10,
    alignItems: "center",
    },
    etaMetaText: {
        color: "rgba(0,0,0,0.65)",
        fontSize: 12,
        fontWeight: "800",
    },

    // Route summary
    routeSummary: {
        position: "absolute",
        top: 150,
        left: 14,
        right: 14,
        backgroundColor: "#1f1f1f",
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        elevation: 6,
    },
    routeSummaryText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "800",
    },
    routeError: {
        position: "absolute",
        top: 150,
        left: 14,
        right: 14,
        backgroundColor: "#3a1f1f",
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        elevation: 6,
    },
    routeErrorText: {
        color: "#fff",
        fontSize: 13,
    },

    // Permissions
    permissionBanner: {
        position: "absolute",
        top: 18,
        left: 14,
        right: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        opacity: 0.95,
    },
    permissionText: {
        fontSize: 14,
    },
    permissionSubText: {
        marginTop: 6,
        fontSize: 12,
        opacity: 0.9,
    },

    // Loading and count
    loadingBadge: {
        position: "absolute",
        top: 18,
        right: 14,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1f1f1f",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        elevation: 4,
    },
    loadingText: {
        color: "#fff",
        fontSize: 12,
        marginLeft: 6,
    },
    countBadge: {
        position: "absolute",
        top: 18,
        right: 14,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1f1f1f",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        elevation: 4,
    },
    countText: {
        color: "#fff",
        fontSize: 12,
    },
    refreshIcon: {
        color: "#71B07B",
        fontSize: 16,
        marginLeft: 6,
        fontWeight: "bold",
    },

    // Bottom screen nav bar
    bottomBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 40,
        alignItems: "center",
    },
    buttonContainer: {
        flexDirection: "row",
        backgroundColor: "#71B07B",
        width: 350,
        height: 60,
        alignItems: "center",
        justifyContent: "space-around",
        borderRadius: 10,
        elevation: 10,
    },
    button: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },

    // Add mode banner
    addModeBanner: {
        position: "absolute",
        bottom: 120,
        left: 20,
        right: 86,
        backgroundColor: "#1f1f1f",
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        elevation: 4,
    },
    addModeText: {
        color: "#71B07B",
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
    },
});
