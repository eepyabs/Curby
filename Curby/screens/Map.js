import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapIcon, SettingsIcon, StatsIcon } from '../components/NavIcons';
import { useLocationPref } from "../LocationContext";
import { useTheme } from "../ThemeContext";

const MAPBOX_TOKEN = " ";

Mapbox.setAccessToken(MAPBOX_TOKEN);

Mapbox.setTelemetryEnabled(false);

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

    const isGoodFix = (loc) => {
        if (!loc?.coords) return false;
        const acc = typeof loc.coords.accuracy === "number" ? loc.coords.accuracy : 9999;

        if (userCoords) return acc <= 40;

        return acc <= 120;
    };

    const stopWatching = async () => {
        try {
            if (watchSubRef.current) {
                watchSubRef.current.remove();
                watchSubRef.current = null;
            }
        } catch (e) {

        }
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
        } catch (e) {

        }

        try {
            const current = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Highest,
                maximumAge: 1000,
                timeout: 15000,
            });

            if (isGoodFix(current)) {
                const coords = [current.coords.longitude, current.coords.latitude];
                setUserCoords(coords);

                if (cameraRef.current?.setCamera) {
                    cameraRef.current.setCamera({
                        centerCoordinate: coords,
                        zoomLevel: 15,
                        animationDuration: 700,
                    });
                }
            }
        } catch (e) {
            setLocError(String(e?.message ?? e));
        }

        await stopWatching();

        try {
            const sub = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Highest,
                    timeInterval: 1000,
                    distanceInterval: 1,
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

        return () => {
            stopWatching();
        };
    }, [locationEnabled]);

    useEffect(() => {
        if (!locationEnabled) return;
        if (!userCoords) return;
        if (!cameraRef.current?.setCamera) return;

        cameraRef.current.setCamera({
            centerCoordinate: userCoords,
            zoomLevel: 15,
            animationDuration: 500,
        });
    }, [locationEnabled, userCoords]);

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

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.mapWrap}>
                <Mapbox.MapView
                    style={styles.map}
                    styleURL={Mapbox.StyleURL.Street}
                    logoEnabled={false}
                    attributionEnabled={false}
                    compassEnabled
                    scaleBarEnabled
                    onDidFailLoadingMap={(e) => setMapError(JSON.stringify(e?.nativeEvent ?? e))}
                >
                    <Mapbox.Camera
                        ref={cameraRef}
                        zoomLevel={12}
                        centerCoordinate={userCoords ?? [-92.0, 31.0]}
                    />

                    {locationEnabled && hasPermission && servicesEnabled && (
                        <Mapbox.LocationPuck puckBearingEnabled puckBearing="heading" />
                    )}
                </Mapbox.MapView>

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
});