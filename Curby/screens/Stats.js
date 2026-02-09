import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../ThemeContext';
import { StatsIcon, MapIcon, SettingsIcon } from '../components/NavIcons';


export default function StatsScreen({ navigation }) {
    const { theme } = useTheme();

    const stats = {
        distance: '12.4 mi',
        duration: '32 min',
        potholes: 18,
        severePotholes: 3,
        constructionZones: 2,
        constructionDistance: '1.3 mi',
    };

    return (
        <View 
            style={[
                styles.container,
                { backgroundColor: theme.background },
            ]}
        >
            <View style={styles.content}>
                <Text style={[styles.title, { color: theme.text }]}>Today's drive:</Text>

                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Distance</Text>
                            <Text style={styles.summaryValue}>{stats.distance}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Duration</Text>
                            <Text style={styles.summaryValue}>{stats.duration}</Text>
                        </View>
                    </View>

                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Potholes</Text>
                            <Text style={styles.summaryValue}>{stats.potholes}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Severe</Text>
                            <Text style={styles.summaryValue}>{stats.severePotholes}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.tilesRow}>
                    <View style={styles.tile}>
                        <Text style={styles.tileLabel}>Construction zones</Text>
                        <Text style={styles.tileValue}>{stats.constructionZones}</Text>
                    </View>

                    <View style={styles.tile}>
                        <Text style={styles.tileLabel}>Construction length</Text>
                        <Text style={styles.tileValue}>{stats.constructionDistance}</Text>
                    </View>
                </View>    
            </View>

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
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 80,
        paddingBottom: 120,
    },
    title: { 
        fontSize: 26,
        fontWeight: '600', 
        marginBottom: 20 
    },
    summaryCard: {
        backgroundColor: '#1f1f1f',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    summaryItem: {
        flex: 1,
    },
    summaryLabel: {
        color: '#aaaaaa',
        fontSize: 12,
        marginBottom: 4,
    },
    summaryValue: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: '600',
    },
    tilesRow: {
        flexDirection: 'row',
        gap: 12,
    },
    tile: {
        flex: 1,
        backgroundColor: '#2b2b2b',
        borderRadius: 14,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    tileLabel: {
        color: '#cccccc',
        fontSize: 11,
        marginBottom: 4,
    },
    tileValue: {
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