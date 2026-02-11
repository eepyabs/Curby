import { CATEGORIES } from "../constants/detectionClasses";

const PROJECT_ID = "campusdrive-insight";
const API_KEY = "AIzaSyDhxi8arURN91SW4ZH17BNY3r8SvMpHovM";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/%28default%29/documents`;

// Reverse lookup: normalized type → display class name used by the filter.
const NORMALIZED_TO_CLASS = {};
for (const cat of Object.values(CATEGORIES)) {
  for (const cls of cat.classes) {
    const key = cls.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
    NORMALIZED_TO_CLASS[key] = cls;
  }
}

function normalizeType(type) {
  return (type ?? "").toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

const TYPE_COLORS = {
  pothole: "#e74c3c",
  curb: "#a52a2a",
  "curb-cut": "#8040ff",
  sidewalk: "#804080",
  manhole: "#282828",
  "catch-basin": "#648cb4",
  "fire-hydrant": "#dc8080",
  "stop-sign": "#ff4444",
  "traffic-light": "#ffa500",
  "street-light": "#f0e68c",
  "speed-bump": "#3498db",
  fence: "#00c000",
  "guard-rail": "#c4c4c4",
  bench: "#00aa1e",
  "bike-rack": "#ffff80",
  billboard: "#fa001e",
  "junction-box": "#de2828",
  mailbox: "#64aa1e",
  "phone-booth": "#212121",
  "trash-can": "#e8a820",
  "utility-pole": "#c8c8c8",
  crosswalk: "#ff00c8",
  "lane-marking": "#ff0000",
};

function colorForType(type) {
  return TYPE_COLORS[normalizeType(type)] ?? "#71B07B";
}

/** Extract a JS value from a Firestore REST field value object. */
function parseField(f) {
  if (f == null) return null;
  if ("stringValue" in f) return f.stringValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("geoPointValue" in f) return f.geoPointValue; // { latitude, longitude }
  if ("timestampValue" in f) return f.timestampValue;
  if ("nullValue" in f) return null;
  if ("mapValue" in f) {
    const obj = {};
    for (const [k, v] of Object.entries(f.mapValue.fields ?? {})) {
      obj[k] = parseField(v);
    }
    return obj;
  }
  if ("arrayValue" in f) {
    return (f.arrayValue.values ?? []).map(parseField);
  }
  return null;
}

/** Fetch with timeout (React Native fetch can hang). */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch all detections from Firestore REST API and return GeoJSON.
 * Retries once on network failure.
 */
export async function fetchDetectionsAsGeoJSON() {
  const url = `${BASE}/detection?key=${API_KEY}`;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        // Wait 2s before retry
        await new Promise((r) => setTimeout(r, 2000));
        console.log("Retrying detection fetch…");
      }

      const resp = await fetchWithTimeout(url);

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Firestore REST ${resp.status}: ${body}`);
      }

      const json = await resp.json();
      const docs = json.documents ?? [];
      const features = [];

      for (const doc of docs) {
        const fields = doc.fields ?? {};

        const loc = parseField(fields.location);
        if (!loc) continue;

        const lat = loc.latitude;
        const lon = loc.longitude;
        if (lat == null || lon == null) continue;

        const type = parseField(fields.type) ?? "unknown";
        const displayClass = NORMALIZED_TO_CLASS[normalizeType(type)] ?? type;

        // Extract doc ID from the full resource name
        const docId = doc.name.split("/").pop();

        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lon, lat],
          },
          properties: {
            id: docId,
            type,
            classes: [displayClass],
            markerColor: colorForType(type),
            confidence: parseField(fields.confidence) ?? 0,
            severity: parseField(fields.severity) ?? 0,
            source: parseField(fields.sourceDeviceId) ?? "unknown",
            roadSegmentId: parseField(fields.roadSegmentId) ?? "",
          },
        });
      }

      console.log(`Loaded ${features.length} detections from Firestore`);
      return { type: "FeatureCollection", features };
    } catch (e) {
      lastError = e;
      console.warn(`Detection fetch attempt ${attempt + 1} failed:`, e?.message ?? e);
    }
  }
  throw lastError;
}

/**
 * Create a new detection via Firestore REST API.
 */
export async function createDetection({
  type,
  latitude,
  longitude,
  roadSegmentId,
  sourceDeviceId,
  severity = 3,
  confidence = 1.0,
}) {
  const url = `${BASE}/detection?key=${API_KEY}`;
  const now = new Date().toISOString();

  const body = {
    fields: {
      type: { stringValue: type },
      location: { geoPointValue: { latitude, longitude } },
      roadSegmentId: {
        stringValue: roadSegmentId || `seg_${latitude.toFixed(3)}_${longitude.toFixed(3)}`,
      },
      sourceDeviceId: { stringValue: sourceDeviceId || "android_app" },
      severity: { integerValue: String(severity) },
      confidence: { doubleValue: confidence },
      createdAt: { timestampValue: now },
      lastUpdated: { timestampValue: now },
    },
  };

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Firestore REST ${resp.status}: ${await resp.text().catch(() => "")}`);
  }

  const doc = await resp.json();
  return { id: doc.name.split("/").pop() };
}
