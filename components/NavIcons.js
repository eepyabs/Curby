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

export const RoadHazardIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
            d="M12 3 2.6 20.2c-.4.8.2 1.8 1.1 1.8h16.6c.9 0 1.5-1 .9-1.8L12 3Z"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
        />
        <Line x1="12" y1="9" x2="12" y2="14" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Circle cx="12" cy="17" r="1.2" fill={color} />
    </Svg>
);

export const InfrastructureIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path
            d="M6 18c1.2-4.8 3.6-7 6-7s4.8 2.2 6 7"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
        />
        <Line x1="8" y1="18" x2="8" y2="14.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1="16" y1="18" x2="16" y2="14.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

export const SignageIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path
            d="M6 6h10l2 2-2 2H6V6Z"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
        />
        <Line x1="8" y1="8" x2="15" y2="8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

export const StreetObjectIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
            d="M7 9.5 12 6l5 3.5v6L12 19l-5-3.5v-6Z"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
        />
        <Line x1="12" y1="6" x2="12" y2="19" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1="7" y1="9.5" x2="12" y2="13" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1="17" y1="9.5" x2="12" y2="13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

export const LaneMarkingsIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
            d="M7 3 5 21M17 3l2 18"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
        />
        <Line x1="12" y1="4" x2="12" y2="7" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1="12" y1="10" x2="12" y2="13" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1="12" y1="16" x2="12" y2="19" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

export const PeopleIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="7.5" r="3" fill="none" stroke={color} strokeWidth={2} />
        <Path
            d="M5.5 20c.8-4 3.5-6 6.5-6s5.7 2 6.5 6"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
        />
    </Svg>
);

export const ReportIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
            d="M3 20V5l16-3v16L3 20z"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
        />
        <Line x1="3" y1="12.5" x2="3" y2="22" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

export const VehicleIcon = ({ size = 18, color = "#ffffff" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
            d="M6.5 16.5h11l1.2-3.6c.2-.6-.1-1.2-.7-1.4L15.7 10c-.5-1.5-1.1-2.5-2.6-2.5h-2.2c-1.5 0-2.1 1-2.6 2.5L6 11.5c-.6.2-.9.8-.7 1.4l1.2 3.6Z"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
        />
        <Circle cx="8.5" cy="17.5" r="1.6" fill="none" stroke={color} strokeWidth={2} />
        <Circle cx="15.5" cy="17.5" r="1.6" fill="none" stroke={color} strokeWidth={2} />
        <Line x1="7.5" y1="13"  x2="16.5" y2="13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);