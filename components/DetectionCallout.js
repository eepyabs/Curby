import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { CATEGORIES } from "../constants/detectionClasses";
import {
    RoadHazardIcon,
    InfrastructureIcon,
    SignageIcon,
    StreetObjectIcon,
    LaneMarkingsIcon,
    PeopleIcon,
    VehicleIcon,
    ReportIcon,
} from "./NavIcons";

const SEVERITY_LABELS = ["", "Low", "Minor", "Moderate", "High", "Critical"];
const SEVERITY_COLORS = ["", "#4488FF", "#FFD700", "#FF8C00", "#FF4444", "#CC0000"];

function getCategoryNameForType(typeName) {
    if (!typeName) return null;
    for (const [catName, cat] of Object.entries(CATEGORIES)) {
        if (Array.isArray(cat?.classes) && cat.classes.includes(typeName)) return catName;
    }
    return null;
}

function getCategoryColor(catName) {
    if (!catName) return "#ffffff";
    return CATEGORIES?.[catName]?.color ?? "#ffffff";
}

function CategoryIcon({ catName, color, size = 18}) {
    switch (catName) {
        case "Road Hazard":
            return <RoadHazardIcon size={size} color={color} />;
        case "Infrastructure":
            return <InfrastructureIcon size={size} color={color} />;
        case "Signage":
            return <SignageIcon size={size} color={color} />;
        case "Street Objects":
            return <StreetObjectIcon size={size} color={color} />;
        case "Lane Markings":
            return <LaneMarkingsIcon size={size} color={color} />;
        case "People":
            return <PeopleIcon size={size} color={color} />;
        case "Vehicle":
            return <VehicleIcon size={size} color={color} />;
        case "Reports":
            return <ReportIcon size={size} color={color} />;
        default:
            return null;
    }
}

function formatExpiry(expiresAt) {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}m left`;
    const hr = Math.floor(min / 60);
    const rem = min % 60;
    return rem > 0 ? `${hr}h ${rem}m left` : `${hr}h left`;
}

/**
 * Detail card shown when a detection marker is tapped.
 *
 * Props:
 *   feature – a GeoJSON Feature from the detection layer
 *   canDelete - whether or not current user can delete detection
 *   onDelete - callback when delete is pressed
 */
export default function DetectionCallout({ feature, canDelete = false, onDelete, onClose }) {
  const p = feature?.properties;
  if (!p) return null;

  const severity = p.severity ? Math.max(1, Math.min(5, p.severity)) : null;
  const confidence = ((p.confidence ?? 0) * 100).toFixed(0);
  const expiryText = formatExpiry(p.expiresAt);
  const reporter = p.createdBy && p.createdBy !== "unknown" && p.createdBy !== "android_app"
    ? p.createdBy : null;

  const typeName = p.type ?? "Unknown";
  const catName = getCategoryNameForType(typeName);
  const catColor = getCategoryColor(catName);

  return (
    <View style={styles.card}>
        <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
                <View style={styles.titleIcon}>
                    <CategoryIcon catName={catName} color={catColor} size={18} />
                </View>
                <Text style={styles.title}>{typeName}</Text>
            </View>

            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
        </View>

        {severity !== null && (
            <View style={styles.row}>
                <Text style={styles.label}>Severity</Text>
                <View style={styles.severityRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                        <View
                            key={n}
                            style={[
                                styles.severityDot,
                                { backgroundColor: n <= severity ? SEVERITY_COLORS[severity] : "#333" },
                            ]}
                        />
                    ))}
                    <Text style={[styles.severityLabel, { color: SEVERITY_COLORS[severity] }]}>
                        {SEVERITY_LABELS[severity]}
                    </Text>
                </View>
            </View>
        )}

        {p.source !== "user" && (
            <View style={styles.row}>
                <Text style={styles.label}>Confidence</Text>
                <Text style={styles.value}>{confidence}%</Text>
            </View>
        )}

        {reporter && (
            <View style={styles.row}>
                <Text style={styles.label}>Reported by</Text>
                <Text style={styles.value}>{reporter}</Text>
            </View>
        )}

        {expiryText && (
            <View style={styles.row}>
                <Text style={styles.label}>Expires</Text>
                <Text style={[styles.value, expiryText === "Expired" && { color: "#FF4444" }]}>
                    {expiryText}
                </Text>
            </View>
        )}

        {canDelete && (
            <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                    console.log("TouchableOpacity pressed");
                    onDelete?.();
                }}
                activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <Text style={styles.deleteBtnText}>Delete Detection</Text>
            </TouchableOpacity>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1f1f1f",
    borderRadius: 10,
    padding: 12,
    width: 240,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  titleIcon: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  label: {
    color: "#aaa",
    fontSize: 12,
  },
  value: {
    color: "#71B07B",
    fontSize: 13,
    fontWeight: "600",
  },
  severityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  severityLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 4,
  },
  deleteBtn: {
    marginTop: 12,
    backgroundColor: "#D64545",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  closeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
});
