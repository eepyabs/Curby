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
