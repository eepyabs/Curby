import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Animated, Easing, ImageBackground, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUser, loginUser } from '../services/firestoreService';

export default function Login({ navigation }) {
    const [isSignup, setIsSignup] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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

    const handleLogin = async () => {
        setError('');
        if (!username.trim() || !password) {
            setError('Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            const user = await loginUser(username.trim(), password);
            const resolvedUsername = user.username ?? username.trim();
            console.log('Login success:', resolvedUsername);
            await AsyncStorage.setItem('username', resolvedUsername);
            navigation.replace('Map', { username: resolvedUsername });
        } catch (e) {
            console.error('Login error:', e.message);
            setError(e.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async () => {
        setError('');
        if (!firstName.trim() || !email.trim() || !username.trim() || !password) {
            setError('Please fill in all fields');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            const result = await createUser({
                email: email.trim(),
                username: username.trim(),
                password,
                displayName: firstName.trim(),
            });
            console.log('Signup success, user ID:', result.id);
            Alert.alert('Account Created', 'You can now log in.', [
                { text: 'OK', onPress: () => setIsSignup(false) },
            ]);
            setPassword('');
            setConfirmPassword('');
        } catch (e) {
            console.error('Signup error:', e.message);
            setError(e.message || 'Signup failed');
        } finally {
            setLoading(false);
        }
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

                            {error ? <Text style={styles.errorText}>{error}</Text> : null}

                            {isSignup ? (
                                <>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Firstname"
                                        placeholderTextColor="#999"
                                        value={firstName}
                                        onChangeText={(t) => { setFirstName(t); setError(''); }}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Email"
                                        placeholderTextColor="#999"
                                        value={email}
                                        onChangeText={(t) => { setEmail(t); setError(''); }}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Username"
                                        placeholderTextColor="#999"
                                        value={username}
                                        onChangeText={(t) => { setUsername(t); setError(''); }}
                                        autoCapitalize="none"
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Password"
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        value={password}
                                        onChangeText={(t) => { setPassword(t); setError(''); }}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Confirm Password"
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        value={confirmPassword}
                                        onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
                                    />
                                </>
                            ) : (
                                <>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Username"
                                        placeholderTextColor="#999"
                                        value={username}
                                        onChangeText={(t) => { setUsername(t); setError(''); }}
                                        autoCapitalize="none"
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Password"
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        value={password}
                                        onChangeText={(t) => { setPassword(t); setError(''); }}
                                    />
                                </>
                            )}

                            <TouchableOpacity
                                style={[styles.button, loading && styles.buttonDisabled]}
                                onPress={isSignup ? handleSignup : handleLogin}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.buttonText}>
                                        {isSignup ? 'Signup' : 'Login'}
                                    </Text>
                                )}
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
    errorText: {
        color: '#ff6b6b',
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 12,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
});