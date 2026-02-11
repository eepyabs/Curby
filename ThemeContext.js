import React, { createContext, useContext, useState } from 'react';

const themes = {
    light: {
        mode: 'light',
        background: '#e9e8e9ff',
        text: '#000000',
    },
    dark: {
        mode: 'dark',
        background: '#366B4D',
        text: '#ffffff',
    },
};

const ThemeContext = createContext({
    theme: themes.light,
    mode: 'light',
    toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
    const [mode, setMode] = useState('light');

    const toggleTheme = () => {
        setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    const value = {
        theme: mode === 'light' ? themes.light : themes.dark,
        mode,
        toggleTheme,
    };

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);