import React, { createContext, useContext, useMemo, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Location from "expo-location";

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
    const [locationEnabled, setLocationEnabled] = useState(false);
    const [hasPermission, setHasPermission] = useState(false);
    const [servicesEnabled, setServicesEnabled] = useState(true);

    const ensurePermissionAndServices = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === "granted";
        setHasPermission(granted);

        if (!granted) {
            Alert.alert(
                "Location permission needed",
                "To show your exact location on the map, enable location permission in Settings.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Open Settings",
                        onPress: () => {
                            Linking.openSettings();
                        },
                    },
                ]
            );
            return { ok: false, reason: "permission" };
        }

        const enabled = await Location.hasServicesEnabledAsync();
        setServicesEnabled(enabled);

        if (!enabled) {
            Alert.alert(
                "Turn on Location Services",
                Platform.OS === "android"
                    ? "Your GPS/location services are OFF. Turn them on to get your exact location."
                    : "Location Services are OFF. Turn them on to get your exact location.",
                [{ text: "OK" }]
            );
            return { ok: false, reason: "services" };
        }
        return { ok: true };
    };

    const enableLocation = async () => {
        const res = await ensurePermissionAndServices();
        if (res.ok) setLocationEnabled(true);
        return res.ok;
    };

    const disableLocation = () => {
        setLocationEnabled(false);
    };

    const value = useMemo(
        () => ({
            locationEnabled,
            hasPermission,
            servicesEnabled,
            enableLocation,
            disableLocation,
            ensurePermissionAndServices,
        }),
        [locationEnabled, hasPermission, servicesEnabled]
    );

    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationPref() {
    const ctx = useContext(LocationContext);
    if (!ctx) throw new Error("useLocationPref must be used inside a LocationProvider");
    return ctx;
}