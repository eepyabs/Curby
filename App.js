import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Login from './screens/Login';
import Map from './screens/Map';
import Settings from './screens/Settings';
import Stats from './screens/Stats';

import { LocationProvider } from './LocationContext';
import { ThemeProvider } from './ThemeContext';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <LocationProvider>
                    <NavigationContainer>
                        <Stack.Navigator initialRouteName='Login'>
                            <Stack.Screen
                                name="Login"
                                component={Login}
                                options={{ headerShown: false }}
                            />
                            <Stack.Screen name="Map" component={Map} />
                            <Stack.Screen name="Stats" component={Stats} />
                            <Stack.Screen name="Settings" component={Settings} />
                        </Stack.Navigator>
                    </NavigationContainer>
                </LocationProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}