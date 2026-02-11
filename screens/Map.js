import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

    // Filtered GeoJSON -- recomputed when filter or data changes
    const filteredGeoJSON = useMemo(() => {
        if (!detectionGeoJSON) return null;
        const filtered = detectionGeoJSON.features.filter((f) => {
            const classes = f.properties.classes ?? [];
            return classes.some((c) => classFilter[c]);
        });
        return { type: "FeatureCollection", features: filtered };
    }, [detectionGeoJSON, classFilter]);

    // ── Reusable fetch function ──────────────────────────────────────
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

    // ── Location helpers (unchanged) ─────────────────────────────────

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

                {/* Loading spinner (initial load only) */}
                {loadingDetections && (
                    <View style={styles.loadingBadge}>
                        <ActivityIndicator size="small" color="#71B07B" />
                        <Text style={styles.loadingText}>Loading detections…</Text>
                    </View>
                )}

                {/* Detection count + tap-to-refresh (after initial load) */}
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
                        <Text style={[styles.permissionText, { color: "#fff" }]}>
                            {bannerText}
                        </Text>
                        {locationEnabled && !hasPermission && (
                            <Text style={[styles.permissionSubText, { color: "#fff" }]}>
                                Tip: Android Settings → Apps → Curby → Permissions → Location → Allow
                            </Text>
                        )}
                    </View>
                )}

                {/* Class filter panel */}
                <ClassFilterPanel
                    classFilter={classFilter}
                    onFilterChange={setClassFilter}
                />

                {/* Add-mode banner */}
                {addMode && (
                    <View style={styles.addModeBanner}>
                        <Text style={styles.addModeText}>Tap map to place detection</Text>
                    </View>
                )}

                {/* Add detection FAB */}
                <AddDetectionFAB
                    active={addMode}
                    onPress={() => setAddMode((v) => !v)}
                />

                {/* Add detection sheet */}
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
                            console.warn("Failed to create detection:", e);
                        }
                    }}
                    onCancel={() => {
                        setShowAddSheet(false);
                        setAddCoordinate(null);
                    }}
                />
            </View>

            {/* Bottom nav bar */}
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
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
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
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
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
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 40,
        alignItems: 'center',
    },
    buttonContainer: {
        flexDirection: 'row',
        backgroundColor: '#71B07B',
        width: 350,
        height: 60,
        alignItems: 'center',
        justifyContent: 'space-around',
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.35,
        shadowRadius: 15,
        elevation: 10,
    },
    button: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addModeBanner: {
        position: 'absolute',
        bottom: 120,
        left: 20,
        right: 86,
        backgroundColor: '#1f1f1f',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    addModeText: {
        color: '#71B07B',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});