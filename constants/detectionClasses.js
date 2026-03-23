/**
 * Detection class categories, colors, and filter defaults.
 * Matches the classes that webcam_segmentation.py can actually upload
 * (core Mapillary Vistas model classes minus ignored background classes).
 */

export const CATEGORIES = {
  "Road Hazard": {
    color: "#FF4444",
    classes: [
      "Pothole", "Speed Bump", "Construction", "Traffic Cone", "Oil Stain",
    ],
  },
  Reports: {
    color: "#FF6B35",
    classes: ["Police", "Car Wreck", "Stopped Vehicle", "Roadkill", "Debris", "Traffic"],
  },
  Infrastructure: {
    color: "#FF8C00",
    classes: [
      "Curb", "Sidewalk", "Crosswalk - Plain", "Curb Cut", "Manhole",
      "Fence", "Guard Rail", "Barrier", "Catch Basin", "Rail Track",
    ],
  },
  Signage: {
    color: "#FFD700",
    classes: [
      "Traffic Light", "Traffic Sign (Front)", "Traffic Sign (Back)",
      "Traffic Sign Frame", "Billboard", "Banner",
    ],
  },
  "Street Objects": {
    color: "#4488FF",
    classes: [
      "Street Light", "Pole", "Utility Pole", "Fire Hydrant", "Bench",
      "Trash Can", "Mailbox", "Phone Booth", "Bike Rack", "Junction Box",
      "CCTV Camera",
    ],
  },
  "Lane Markings": {
    color: "#AA66FF",
    classes: [
      "Lane Marking - Crosswalk", "Lane Marking - General",
    ],
  },
  People: {
    color: "#00CC88",
    classes: ["Person", "Bicyclist", "Motorcyclist", "Other Rider"],
  },
  Vehicles: {
    color: "#0088CC",
    classes: [
      "Car", "Bus", "Truck", "Bicycle", "Motorcycle", "Caravan", "Trailer",
      "On Rails", "Other Vehicle", "Wheeled Slow", "Boat",
    ],
  },
};

// Flat map: className -> hex color
export const CLASS_COLOR_MAP = {};
for (const [, cat] of Object.entries(CATEGORIES)) {
  for (const cls of cat.classes) {
    CLASS_COLOR_MAP[cls] = cat.color;
  }
}

// User-reportable hazard categories (Waze-style)
export const USER_REPORT_CATEGORIES = [
  {
    label: "Law Enforcement",
    color: "#4488FF",
    types: [
      { key: "Police", label: "Police", emoji: "🚔", hasSeverity: false, expiryMinutes: 90 },
    ],
  },
  {
    label: "Hazards",
    color: "#FF4444",
    types: [
      { key: "Car Wreck", label: "Car Wreck", emoji: "🚨", hasSeverity: true, expiryMinutes: 120, severityLabels: ["Minor", "Major"] },
      { key: "Stopped Vehicle", label: "Stopped Vehicle", emoji: "🛑", hasSeverity: false, expiryMinutes: 45 },
      { key: "Roadkill", label: "Roadkill", emoji: "⚠", hasSeverity: false, expiryMinutes: 480 },
      { key: "Debris", label: "Debris", emoji: "⚠", hasSeverity: true, expiryMinutes: 180, severityLabels: ["Small", "Large"] },
    ],
  },
  {
    label: "Road Conditions",
    color: "#FF8C00",
    types: [
      { key: "Pothole", label: "Pothole", emoji: "⚠", hasSeverity: true, expiryMinutes: 4320, severityLabels: ["Small", "Large"] },
      { key: "Traffic", label: "Traffic", emoji: "🚦", hasSeverity: true, expiryMinutes: 30, severityLabels: ["Light", "Heavy"] },
    ],
  },
  {
    label: "Construction",
    color: "#FFD700",
    types: [
      { key: "Construction", label: "Construction", emoji: "🚧", hasSeverity: true, expiryMinutes: 600, severityLabels: ["Single Lane", "Road Closed"] },
    ],
  },
];

// Flat map: type key → emoji (for map symbol rendering)
export const TYPE_EMOJI = {
  Police: "🚔",
  "Car Wreck": "🚨",
  "Stopped Vehicle": "🛑",
  Roadkill: "⚠",
  Debris: "⚠",
  Pothole: "⚠",
  Traffic: "🚦",
  Construction: "🚧",
  "Speed Bump": "⚠",
  "Traffic Light": "🚦",
  "Traffic Cone": "🚧",
};

// Returns a filter object with every class enabled
export function defaultClassFilter() {
  const filter = {};
  for (const [, cat] of Object.entries(CATEGORIES)) {
    for (const cls of cat.classes) {
      filter[cls] = true;
    }
  }
  return filter;
}
