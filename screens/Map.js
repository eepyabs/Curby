import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MapIcon, SettingsIcon, StatsIcon } from '../components/NavIcons';
import ClassFilterPanel from '../components/ClassFilterPanel';
import DetectionCallout from '../components/DetectionCallout';
import AddDetectionFAB from '../components/AddDetectionFAB';
import AddDetectionSheet from '../components/AddDetectionSheet';
import { useLocationPref } from "../LocationContext";
import { useTheme } from "../ThemeContext";
import { CATEGORIES, defaultClassFilter } from "../constants/detectionClasses";
import { createDetection, fetchDetectionsAsGeoJSON, deleteDetection } from "../services/firestoreService";

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

async function geocodeAddressSingle(query, proximity) {
    const q = query.trim();
    if (!q) throw new Error("Enter a destination first.");

    const params = new URLSearchParams({
        q,
        access_token: MAPBOX_TOKEN,
        limit: "8",
        country: "US",
        language: "en",
    });

    if (proximity && Array.isArray(proximity) && proximity.length === 2) {
        params.set("proximity", `${proximity[0]},${proximity[1]}`);
    }

    const url = `https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Search failed (${res.status})`);

    const json = await res.json();
    const feature = json?.features?.[0];
    const center = feature?.geometry?.coordinates;

    if (!center || !Array.isArray(center) || center.length !== 2) {
        throw new Error("No valid destination found");
    }

    return center;
}

async function searchBoxSuggest(query, proximity, sessionToken) {
    const q = query.trim();
    if (!q) return [];

    const params = new URLSearchParams({
        q,
        access_token: MAPBOX_TOKEN,
        session_token: sessionToken,
        limit: "8",
        country: "US",
        language: "en",
    });

    if (proximity && Array.isArray(proximity) && proximity.length === 2) {
        params.set("proximity", `${proximity[0]},${proximity[1]}`);
    }

    const url = `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Suggest failed (${res.status})`);

    const json = await res.json();
    return json?.suggestions ?? [];
}

async function searchBoxRetrieve(mapboxId, sessionToken) {
    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        session_token: sessionToken,
    });

    const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Retrieve failed (${res.status})`);

    const json = await res.json();
    const feature = json?.features?.[0];
    const center = feature?.geometry?.coordinates;

    if (!center || !Array.isArray(center) || center.length !== 2) {
        throw new Error("No valid destination found");
    }

    return {
        feature,
        center,
        label:
            feature?.properties?.full_address ||
            feature?.properties?.name ||
            feature?.properties?.place_formatted ||
            "Selected destination",
    };
}

async function fetchDirectionsWithWaypoints(origin, stops = [], destination) {
    const coords = [origin, ...stops, destination]
        .filter(Boolean)
        .map((c) => `${c[0]},${c[1]}`)
        .join(";");

    const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
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

function getManeuverSymbol(step) {
    const type = step?.maneuver?.type ?? "";
    const modifier = step?.maneuver?.modifier ?? "";

    // U-turn
    if (type === "turn" && modifier === "uturn") return "↷";
    if (type === "continue" && modifier === "uturn") return "↷";

    // Leave / Arrive
    if (type === "leave") return "↑";
    if (type === "arrive") return "•";

    // Roundabout / Rotary
    if (type === "roundabout" || type === "rotary") return "⟳";
    if (type === "roundabout turn" || type === "exit roundabout" || type === "exit rotary") return "⤴";

    // Forks / Merges
    if (type === "fork") {
        if (modifier === "left" || modifier === "slight left") return "↰";
        if (modifier === "right" || modifier === "slight right") return "↱";
        return "⑂";
    }

    if (type === "merge") {
        if (modifier === "left" || modifier === "slight left") return "↖";
        if (modifier === "right" || modifier === "slight right") return "↗";
        return "⇉";
    }

    // Standard turns
    if (modifier === "left") return "←";
    if (modifier === "right") return "→";
    if (modifier === "slight left") return "↖";
    if (modifier === "slight right") return "↗";
    if (modifier === "sharp left") return "↰";
    if (modifier === "sharp right") return "↱";
    if (modifier === "straight") return "↑";

    // Continue / Default
    if (type === "continue") return "↑";
    if (type === "new name") return "↑";
    if (type === "notification") return "↑";
    return "↑";
}

function getSuggestionTitle(item) {
    return (
        item?.name ||
        item?.name_preferred ||
        item?.feature_name ||
        item?.place_formatted ||
        item?.full_address ||
        "Unknown place"
    );
}

function getSuggestionSubtitle(item) {
    return (
        item?.place_formatted ||
        item?.full_address ||
        item?.address ||
        ""
    );
}

function makeSearchSessionToken() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    const [searchSessionToken, setSearchSessionToken] = useState(makeSearchSessionToken());

    // Navigation state
    const [addressQuery, setAddressQuery] = useState("");
    const [destinationCoords, setDestinationCoords] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [routeError, setRouteError] = useState("");
    const [routeSummary, setRouteSummary] = useState(null);
    const [routeGeoJSON, setRouteGeoJSON] = useState(null);
    const [addressLocked, setAddressLocked] = useState(false);
    const [tripStops, setTripStops] = useState([]);
    const [showAddStopSearch, setShowAddStopSearch] = useState(false);
    const [pendingStopQuery, setPendingStopQuery] = useState("");
    const [pendingStopLocked, setPendingStopLocked] = useState(false);
    const [finalDestination, setFinalDestination] = useState(null);
    const [showStopsModal, setShowStopsModal] = useState(false);

    // Turn-by-turn state
    const [navActive, setNavActive] = useState(false);
    const [navSteps, setNavSteps] = useState([]);
    const [navStepIdx, setNavStepIdx] = useState(0);

    const myDeviceId = "android_app";

    // Filtered GeoJSON -- recomputed when filter or data changes
    const filteredGeoJSON = useMemo(() => {
        if (!detectionGeoJSON) return null;
        const filtered = detectionGeoJSON.features.filter((f) => {
            const classes = f.properties.classes ?? [];
            return classes.some((c) => classFilter[c]);
        });
        return { type: "FeatureCollection", features: filtered };
    }, [detectionGeoJSON, classFilter]);

     // (heatmap rendered directly from filteredGeoJSON — no per-category split)

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

        const activeQuery = showAddStopSearch ? pendingStopQuery.trim() : addressQuery.trim();
        const locked = showAddStopSearch ? pendingStopLocked : addressLocked;

        if (locked) {
            setSuggestions([]);
            setSuggestLoading(false);
            return;
        }

        if (activeQuery.trim().length < 2) {
            setSuggestions([]);
            setSuggestLoading(false);
            return;
        }

        setSuggestLoading(true);

        const timeoutId = setTimeout(async () => {
            try {
                const results = await searchBoxSuggest(activeQuery, userCoords, searchSessionToken);
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
    }, [
        addressQuery,
        pendingStopQuery,
        userCoords,
        addressLocked,
        pendingStopLocked,
        showAddStopSearch,
    ]);

    // ── Location helpers ─────────────────────────────────
    const isGoodFix = (loc) => {
        if (!loc?.coords) return false;
        const acc = typeof loc.coords.accuracy === "number" ? loc.coords.accuracy : 9999;
        if (userCoords) return acc <= 200;
        return acc <= 500;
    };

    const stopWatching = async () => {
        try {
            watchSubRef.current?.remove?.();
            watchSubRef.current = null;
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
        if (!navActive || !userCoords || !currentManeuverLoc) return;
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

    // Handle tapping detection
    const onDetectionPress = useCallback((e) => {
        const feature = e?.features?.[0];
        if (!feature) return;
        setSelectedFeature(feature);
    }, []);

    // ── Navigation actions ─────────────────────────────────────────────────
    const clearRoute = useCallback(() => {
        setAddressQuery("");
        setPendingStopQuery("");
        setDestinationCoords(null);
        setFinalDestination(null);
        setTripStops([]);
        setRouteGeoJSON(null);
        setRouteSummary(null);
        setRouteError("");
        setSuggestions([]);
        setAddressLocked(false);
        setPendingStopLocked(false);
        setShowAddStopSearch(false);
        setShowStopsModal(false);

        setNavActive(false);
        setNavSteps([]);
        setNavStepIdx(0);
    }, []);

    const endNav = useCallback(() => {
        setNavActive(false);
    }, []);

    const buildBestRoute = useCallback(
        async (destOverride = null, startNav = true, stopsOverride = null) => {
            if (!userCoords) {
                setRouteError("Waiting for your location...");
                return;
            }

            const typed = addressQuery.trim();
            if (!destOverride && !typed && !finalDestination) {
                setRouteError("Type an address first.");
                return;
            }

            setRouteLoading(true);
            setRouteError("");
            setSelectedFeature(null);

            try {
                const dest = destOverride ?? finalDestination ?? (await geocodeAddressSingle(typed, userCoords));

                const stopsToUse = stopsOverride ?? tripStops;

                setDestinationCoords(dest);
                setFinalDestination(dest);

                const routes = await fetchDirectionsWithWaypoints(
                    userCoords,
                    stopsToUse.map((s) => s.center),
                    dest
                );

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

                    const allSteps = (r?.legs ?? []).flatMap((leg) => leg?.steps ?? []);

                    if (!best || score < best.score) {
                        best = {
                            score,
                            durationSec,
                            distanceMeters: r.distance ?? 0,
                            detectionsCount,
                            coords,
                            steps: allSteps,
                        };
                    }
                }

                if (!best) throw new Error("No route candidates to score.");

                setRouteGeoJSON({
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            properties: {},
                            geometry: { type: "LineString", coordinates: best.coords },
                        },
                    ],
                });

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
        [userCoords, addressQuery, finalDestination, tripStops, filteredGeoJSON]
    );

    const onPickSuggestion = useCallback(
        async (suggestion) => {
            Keyboard.dismiss();

            try {
                const mapboxId = suggestion?.mapbox_id;
                if (!mapboxId) return;

                const retrieved = await searchBoxRetrieve(mapboxId, searchSessionToken);
                const center = retrieved.center;
                const name = retrieved.label;

                if (showAddStopSearch) {
                    const nextStops = [...tripStops, { name, center }];
                    setTripStops(nextStops);
                    setPendingStopQuery("");
                    setPendingStopLocked(false);
                    setShowAddStopSearch(false);
                    setSuggestions([]);

                    setSearchSessionToken(makeSearchSessionToken());
                    await buildBestRoute(finalDestination, true, nextStops);
                    return;
                }

                setAddressLocked(true);
                setAddressQuery(name);
                setSuggestions([]);

                setSearchSessionToken(makeSearchSessionToken());
                await buildBestRoute(center, true);
            } catch (e) {
                console.warn("Suggestion retrieve failed: ", e);
                setRouteError(String(e?.message ?? e));
            }
        },
        [showAddStopSearch, tripStops, finalDestination, buildBestRoute, searchSessionToken]
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

    const turnSymbol = getManeuverSymbol(currentStep);

    const arrivalText =
        routeSummary?.durationSec != null
        ? formatArrivalTimeFromNow(routeSummary.durationSec)
        : null;

    const selectedOwner =
        selectedFeature?.properties?.createdBy ??
        selectedFeature?.properties?.sourceDeviceId ??
        selectedFeature?.properties?.source ??
        null;

    const canDelete = selectedOwner === myDeviceId;

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

                    {/* Heatmap */}
                    {filteredGeoJSON && filteredGeoJSON.features.length > 0 && (
                        <Mapbox.ShapeSource id="heatmap-src" shape={filteredGeoJSON}>
                            <Mapbox.HeatmapLayer
                                id="heatmap"
                                style={{
                                    heatmapRadius: [
                                        "interpolate", ["linear"], ["zoom"],
                                        6,  8,
                                        10, 15,
                                        14, 22,
                                        18, 30,
                                    ],
                                    heatmapWeight: 1,
                                    heatmapIntensity: [
                                        "interpolate", ["linear"], ["zoom"],
                                        6,  0.6,
                                        10, 0.8,
                                        14, 1,
                                        18, 1.2,
                                    ],
                                    heatmapOpacity: [
                                        "interpolate", ["linear"], ["zoom"],
                                        6,  0.8,
                                        18, 0.85,
                                    ],
                                    heatmapColor: [
                                        "interpolate",
                                        ["linear"],
                                        ["heatmap-density"],
                                        0,    "rgba(0,0,0,0)",
                                        0.1,  "rgba(0,0,255,0.35)",
                                        0.3,  "rgba(0,200,255,0.55)",
                                        0.5,  "rgba(0,255,128,0.7)",
                                        0.7,  "rgba(255,255,0,0.8)",
                                        0.85, "rgba(255,128,0,0.9)",
                                        1.0,  "rgba(255,0,0,1)",
                                    ],
                                }}
                            />
                        </Mapbox.ShapeSource>
                    )}

                    {/* Tap targets for detections */}
                    {filteredGeoJSON && filteredGeoJSON.features.length > 0 && (
                        <Mapbox.ShapeSource
                            id="detections-hit"
                            shape={filteredGeoJSON}
                            onPress={onDetectionPress}
                            hitbox={{ width: 24, height: 24 }}
                        >
                            <Mapbox.CircleLayer
                                id="detections-hit-circles"
                                style={{
                                    circleRadius: 14,
                                    circleColor: "#000000",
                                    circleOpacity: 0.001,
                                }}
                            />
                        </Mapbox.ShapeSource>
                    )}
                </Mapbox.MapView>

                {selectedFeature && (
                    <View style={styles.calloutOverlay} pointerEvents="box-none">
                        <DetectionCallout
                            feature={selectedFeature}
                            canDelete={canDelete}
                            onDelete={async () => {
                                try {
                                    const detectionId = selectedFeature?.properties?.id;
                                    console.log("DELETE BUTTON PRESSED");
                                    console.log("selectedFeature: ", selectedFeature);
                                    console.log("detectionId: ", detectionId);

                                    if (!detectionId) {
                                        console.warn("No detection ID found");
                                        return;
                                    }

                                    const ok = await deleteDetection(detectionId);
                                    console.log("deleteDetection result: ", ok);

                                    setSelectedFeature(null);
                                    await loadDetections(true);
                                } catch (e) {
                                    console.warn("Failed to delete detection: ", e);
                                }
                            }}
                        />
                    </View>
                )}

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
                                placeholder="Enter destination..."
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
                                    setAddressLocked(true);
                                    buildBestRoute(null, true);
                                }}
                            >
                                {routeLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.searchGoText}>Go</Text>}
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
                                            item.mapbox_id ?? item.name ?? String(idx)
                                        }
                                        keyboardShouldPersistTaps="handled"
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                style={styles.suggestItem}
                                                activeOpacity={0.85}
                                                onPress={() => onPickSuggestion(item)}
                                            >
                                                <Text style={styles.suggestTitle} numberOfLines={1}>
                                                    {getSuggestionTitle(item)}
                                                </Text>
                                                <Text style={styles.suggestSubtitle} numberOfLines={2}>
                                                    {getSuggestionSubtitle(item)}
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
                         <View style={styles.topNavMainRow}>
                            <View style={styles.turnIcon}>
                                <Text style={styles.turnIconText}>{turnSymbol}</Text>
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

                         <View style={styles.topNavButtonsRow}>
                            <TouchableOpacity
                                style={styles.topNavStops}
                                activeOpacity={0.85}
                                onPress={() => setShowStopsModal(true)}
                            >
                                <Text style={styles.topNavStopsText}>Stops</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.topNavAddStop}
                                activeOpacity={0.85}
                                onPress={() => {
                                    setShowAddStopSearch((v) => !v);
                                    setPendingStopQuery("");
                                    setPendingStopLocked(false);
                                    setSuggestions([]);
                                    setRouteError("");
                                }}
                            >
                                <Text style={styles.topNavAddStopText}>
                                    {showAddStopSearch ? "Close" : "Add Stop"}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.topNavEnd}
                                activeOpacity={0.85}
                                onPress={endNav}
                            >
                                <Text style={styles.topNavEndText}>End</Text>
                            </TouchableOpacity>
                         </View>
                    </View>
                )}

                {navActive && showAddStopSearch && (
                    <View style={styles.addStopShell}>
                        <View style={styles.searchRow}>
                            <TextInput
                                value={pendingStopQuery}
                                onChangeText={(t) => {
                                    setPendingStopLocked(false);
                                    setPendingStopQuery(t);
                                    setRouteError("");
                                }}
                                placeholder="Add a stop..."
                                placeholderTextColor="#9aa0a6"
                                style={styles.searchInput}
                                autoCorrect={false}
                                autoCapitalize="none"
                                returnKeyType="search"
                            />
                        </View>

                        {(suggestLoading || suggestions.length > 0) && (
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
                                            item.mapbox_id ?? item.name ?? String(idx)
                                        }
                                        keyboardShouldPersistTaps="handled"
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                style={styles.suggestItem}
                                                activeOpacity={0.85}
                                                onPress={() => onPickSuggestion(item)}
                                            >
                                                <Text style={styles.suggestTitle} numberOfLines={1}>
                                                    {getSuggestionTitle(item)}
                                                </Text>
                                                <Text style={styles.suggestSubtitle} numberOfLines={2}>
                                                    {getSuggestionSubtitle(item)}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                )}
                            </View>
                        )}
                    </View>
                )}

                <Modal
                    visible={showStopsModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowStopsModal(false)}
                >
                    <View style={styles.stopsModalBackdrop}>
                        <View style={styles.stopsModalCard}>
                            <View style={styles.stopsModalHeader}>
                                <Text style={styles.stopsModalTitle}>Trip Stops</Text>

                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={() => setShowStopsModal(false)}
                                >
                                    <Text style={styles.stopsModalClose}>X</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.stopsModalBody}>
                                {tripStops.length > 0 && (
                                    <>
                                        <Text style={styles.stopsSectionLabel}>Added Stops</Text>
                                        {tripStops.map((stop, idx) => (
                                            <View key={`${stop.name}-${idx}`} style={styles.stopRow}>
                                                <Text style={styles.stopIndex}>{idx + 1}.</Text>
                                                <Text style={styles.stopName}>{stop.name}</Text>
                                            </View>
                                        ))}
                                    </>
                                )}

                                <Text style={styles.stopsSectionLabel}>Final Destination</Text>
                                <View style={styles.stopRow}>
                                    <Text style={styles.stopIndex}>★</Text>
                                    <Text style={styles.stopName}>
                                        {addressQuery || "Destination"}
                                    </Text>
                                </View>

                                {tripStops.length === 0 && !addressQuery ? (
                                    <Text style={styles.noStopsText}>No stops added yet.</Text>
                                ) : null}
                            </View>
                        </View>
                    </View>
                </Modal>

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
                              sourceDeviceId: myDeviceId,
                              createdBy: myDeviceId,
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
        top: 50,
        left: 14,
        right: 14,
        backgroundColor: "rgba(22,22,22,0.96)",
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 10,
        elevation: 8,
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
    suggestTitle: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    suggestSubtitle: {
        color: "rgba(255,255,255,0.72)",
        fontSize: 12,
        marginTop: 3,
        lineHeight: 16,
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
        top: 50,
        left: 14,
        right: 14,
        backgroundColor: "rgba(22,22,22,0.96)",
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 14,
        elevation: 10,
    },
    topNavMainRow: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    topNavLeft: {
        flexDirection: "row",
        alignItems: "flex-start",
        flex: 1,
    },
    topNavStops: {
        backgroundColor: "#71B07B",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        minWidth: 92,
        alignItems: "center",
    },
    topNavStopsText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 13,
    },
    topNavAddStop: {
        alignItems: "center",
        minWidth: 92,
        backgroundColor: "#71B07B",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
    },
    topNavAddStopText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 13,
    },
    stopListCard: {
        position: "absolute",
        top: 235,
        left: 14,
        right: 14,
        backgroundColor: "#1f1f1f",
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        elevation: 8,
    },
    stopListTitle: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "800",
        marginBottom: 6,
    },
    stopListItem: {
        color: "rgba(255,255,255,0.85)",
        fontSize: 12,
        marginBottom: 4,
    },
    stopsModalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
    },
    stopsModalCard: {
        width: "100%",
        maxWidth: 360,
        backgroundColor: "#1f1f1f",
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 16,
        elevation: 12,
    },
    stopsModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    stopsModalTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
    },
    stopsModalClose: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
        paddingHorizontal: 6,
    },
    stopsModalBody: {
        gap: 10,
    },
    stopsSectionLabel: {
        color: "#71B07B",
        fontSize: 13,
        fontWeight: "800",
        marginTop: 4,
    },
    stopRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingVertical: 4,
    },
    stopIndex: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "800",
        width: 18,
    },
    stopName: {
        color: "rgba(255,255,255,0.9)",
        fontSize: 14,
        flex: 1,
    },
    noStopsText: {
        color: "rgba(255,255,255,0.75)",
        fontSize: 14,
    },
    turnIcon: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
        marginTop: 2,
    },
    turnIconText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "800",
    },
    topNavTextWrap: {
        flex: 1,
        paddingRight: 4,
    },
    topNavTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
        lineHeight: 24,
    },
    topNavSubtitle: {
        marginTop: 6,
        color: "rgba(255,255,255,0.78)",
        fontSize: 13,
        fontWeight: "600",
    },
    topNavEnd: {
        backgroundColor: "rgba(255,255,255,0.10)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        minWidth: 74,
        alignItems: "center",
    },
    topNavEndText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 13,
    },
    topNavButtonsRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 12,
        gap: 10,
    },
    addStopShell: {
        position: "absolute",
        top: 200,
        left: 14,
        right: 14,
        backgroundColor: "rgba(22,22,22,0.97)",
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 12,
        elevation: 10,
    },
    card: {
        backgroundColor: "#1f1f1f",
        borderRadius: 12,
        padding: 12,
        width: 240,
        elevation: 6,
    },
    title: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 8,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 3,
    },
    label: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
        fontWeight: "600",
    },
    value: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
    },
    deleteBtn: {
        marginTop: 10,
        backgroundColor: "#D64545",
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: "center",
    },
    deleteBtnText: {
        color: "#fff",
        fontWeight: "900",
        letterSpacing: 0.3,
    },
    calloutOverlay: {
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 180,
        alignItems: "center",
        zIndex: 20,
    },

    // ETA card
    bottomEtaCard: {
        position: "absolute",
        left: 14,
        right: 14,
        bottom: 118,
        backgroundColor: "rgba(255,255,255,0.97)",
        borderRadius: 24,
        paddingTop: 10,
        paddingBottom: 14,
        paddingHorizontal: 16,
        elevation: 12,
    },
    bottomHandle: {
        alignSelf: "center",
        width: 42,
        height: 4,
        borderRadius: 2,
        backgroundColor: "rgba(0,0,0,0.18)",
        marginBottom: 12,
    },
    etaRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    etaCol: {
        alignItems: "center",
        flex: 1,
    },
    etaValue: {
        color: "#111",
        fontSize: 18,
        fontWeight: "800",
    },
    etaLabel: {
        marginTop: 2,
        color: "rgba(0,0,0,0.55)",
        fontSize: 12,
        fontWeight: "600",
    },
    etaMetaRow: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "rgba(0,0,0,0.12)",
    },
    etaMetaText: {
        textAlign: "center",
        color: "rgba(0,0,0,0.68)",
        fontSize: 13,
        fontWeight: "600",
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