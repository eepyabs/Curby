import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapIcon, SettingsIcon, StatsIcon } from '../components/NavIcons';
import { useLocationPref } from '../LocationContext';
import { useTheme } from '../ThemeContext';

export default function SettingsScreen({ navigation }) {
    const { locationEnabled, enableLocation, disableLocation } = useLocationPref();

    const { theme, mode, toggleTheme } = useTheme();
    const isDark = mode === 'dark';

    const handleLogout = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
        });
    };

    return (
        <View 
            style={[
                styles.container,
                { backgroundColor: theme.background },
            ]}
        >
            <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

            <View style={styles.switchList}>
                <View style={styles.switchRow}>
                    <Text style={[styles.label, { color: theme.text }]}>Location Permissions</Text>
                    <TouchableOpacity
                        style={[
                            styles.switchOuter,
                            {
                                backgroundColor: locationEnabled
                                    ? '#71B07B'
                                    : isDark
                                    ? '#303136'
                                    : '#f4f4f5',
                            },
                        ]}
                        activeOpacity={0.9}
                        onPress={async () => {
                            if (locationEnabled) {
                                disableLocation();
                            } else {
                                await enableLocation();
                            }
                        }}
                    >
                        <View
                            style={[
                                styles.switchThumb,
                                locationEnabled ? styles.switchThumbOn : styles.switchThumbOff,
                            ]}
                        />
                    </TouchableOpacity>
                </View>

                <View style={styles.switchRow}>
                    <Text style={[styles.label, { color: theme.text }]}>Dark Mode</Text>
                    <TouchableOpacity
                        style={[
                            styles.switchOuter,
                            { backgroundColor: isDark ? '#303136' : '#f4f4f5' },
                        ]}
                        activeOpacity={0.9}
                        onPress={toggleTheme}
                    >
                        <View
                            style={[
                                styles.switchThumb,
                                isDark ? styles.switchThumbOnDark : styles.switchThumbOff,
                            ]}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
                style={styles.logoutButton}
                onPress={handleLogout}
                activeOpacity={0.8}
            >
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>

            <View style={styles.bottomBar}>
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.button}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('Stats')}
                    >
                        <StatsIcon size={20} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.button}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('Map')}
                    >
                        <MapIcon size={20} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.button}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('Settings')}
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
        padding: 24, 
    },
    title: { 
        fontSize: 24, 
        marginBottom: 16,
        alignSelf: 'center', 
    },
    switchList: {
        marginTop: 40,
        gap: 18,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: { 
        fontSize: 20 
    },
    switchOuter: {
        width: 56,
        height: 32,
        borderRadius: 30,
        position: 'relative',
        justifyContent: 'center',
    },
    switchThumb: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        top: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    switchThumbOff: {
        left: 4,
        backgroundColor: '#ff8c00',
    },
    switchThumbOn: {
        left: 28,
        backgroundColor: '#0b3d16',
    },
    switchThumbOnDark: {
        left: 28,
        backgroundColor: '#303136',
        shadowColor: '#8983f7',
    },
    logoutButton: {
        marginBottom: 120,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#d9534f',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoutText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
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