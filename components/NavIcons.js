import React from 'react';
import Svg, { Rect, Path, Circle, Line } from 'react-native-svg';

export const StatsIcon = ({ size = 22, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x="3" y="11" width="4" height="10" rx="1.5" fill={color} />
        <Rect x="10" y="7" width="4" height="14" rx="1.5" fill={color} />
        <Rect x="17" y="4" width="4" height="17" rx="1.5" fill={color} />
    </Svg>
);

export const MapIcon = ({ size= 22, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
            d="M3 6.5 9 4l6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5v-13Z"
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
        />

        <Path
            d="M9 4v13.5M15 6.5v13"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
        />
    </Svg>
);

export const SettingsIcon = ({ size = 22, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 16 16">
        <Path
            d="M.102 2.223A3.004 3.004 0 0 0 3.78 5.897l6.341 6.252A3.003 3.003 0 0 0 13 16a3 3 0 1 0-.851-5.878L5.897 3.781A3.004 3.004 0 0 0 2.223.1l2.141 2.142L4 4l-1.757.364zm13.37 9.019.528.026.287.445.445.287.026.529L15 13l-.242.471-.026.529-.445.287-.287.445-.529.026L13 15l-.471-.242-.529-.026-.287-.445-.445-.287-.026-.529L11 13l.242-.471.026-.529.445-.287.287-.445.529-.026L13 11z"
            fill={color}
        />
    </Svg>
);

export const PlusIcon = ({ size = 22, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
);