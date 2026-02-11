import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Animated, Easing, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Video } from 'expo-av';

export default function Login({ navigation }) {
    const [isSignup, setIsSignup] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const spinValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 6000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();
    }, [spinValue]);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const handleLogin = () => {
        navigation.replace('Map');
    };

    const handleSignup = () => {
        navigation.replace('Map');
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ImageBackground
                source={require('../assets/images/mountains.jpg')}
                style={styles.bgImage}
                resizeMode="cover"
            >
                <BlurView intensity={50} tint="dark" style={styles.blur}>
                    <View style={styles.outer}>
                        <View style={styles.card}>
                            <View style={styles.logoWrapper}>
                                <Video
                                    source={require('../assets/images/0001-0240.mp4')}
                                    style={styles.logo}
                                    resizeMode="contain"
                                    isLooping
                                    shouldPlay
                                    isMuted
                                />
                            </View>
                            <Text style={styles.title}>{isSignup ? 'Sign Up' : 'Login'}</Text>

                            {isSignup ? (
                                <>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Firstname"
                                        placeholderTextColor="#999"
                                        value={firstName}
                                        onChangeText={setFirstName}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Username"
                                        placeholderTextColor="#999"
                                        value={username}
                                        onChangeText={setUsername}
                                        autoCapitalize="none"
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Password"
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Confirm Password"
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                    />
                                </>
                            ) : (
                                <>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Username"
                                        placeholderTextColor="#999"
                                        value={username}
                                        onChangeText={setUsername}
                                        autoCapitalize="none"
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Password"
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        value={password}
                                        onChangeText={setPassword}

                                    />
                                </>
                            )}

                            <TouchableOpacity
                                style={styles.button}
                                onPress={isSignup ? handleSignup : handleLogin}
                            >
                                <Text style={styles.buttonText}>
                                    {isSignup ? 'Signup' : 'Login'}
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.switchRow}>
                                <Text style={styles.switchText}>
                                    {isSignup ? 'Already have an account? ' : "Don't have an account? "}
                                </Text>
                                <TouchableOpacity onPress={() => setIsSignup(!isSignup)}>
                                    <Text style={styles.switchLink}>
                                        {isSignup ? 'Sign In' : 'Sign Up'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </BlurView>
            </ImageBackground>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#000',
    },
    bgImage: {
        flex:1,
    },
    blur: {
        flex: 1,
    },
    outer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '90%',
        maxWidth: 360,
        paddingVertical: 40,
        paddingHorizontal: 24,
        borderRadius: 20,
        backgroundColor: '#366B4D',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 10,
    },
    logoWrapper: {
        width: '70%',
        aspectRatio: 16 / 9,
        borderRadius: 16,
        overflow: 'hidden',
        alignSelf: 'center',
        marginBottom: 24,
        backgroundColor: '#366B4D',
    },
    logo: {
        width: '100%',
        height: '100%',
        alignSelf: 'center',
    },
    title: {
        fontSize: 26,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 24,
    },
    input: {
        width: '100%',
        minHeight: 45,
        backgroundColor: '#212121',
        color: '#fff',
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#212121',
        paddingHorizontal: 10,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 6 },
        shadowOpacity: 0.9,
        shadowRadius: 6,
        elevation: 6,
    },
    button: {
        alignSelf: 'center',
        paddingVertical: 10,
        paddingHorizontal: 35,
        backgroundColor: '#212121',
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#212121',
        marginTop: 4,
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 6 },
        shadowOpacity: 0.9,
        shadowRadius: 6,
        elevation: 6,
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 15,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 18,
    },
    switchText: {
        color: '#fff',
        fontSize: 13,
    },
    switchLink: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
});