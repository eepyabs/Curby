import { StyleSheet, Text, View } from "react-native";

const SEVERITY_LABELS = ["", "Low", "Minor", "Moderate", "High", "Critical"];
const SEVERITY_COLORS = ["", "#4488FF", "#FFD700", "#FF8C00", "#FF4444", "#CC0000"];

/**
 * Detail card shown when a detection marker is tapped.
 *
 * Props:
 *   feature – a GeoJSON Feature from the detection layer
 */
export default function DetectionCallout({ feature }) {
  const p = feature?.properties;
  if (!p) return null;

  const severity = Math.max(1, Math.min(5, p.severity ?? 1));
  const confidence = ((p.confidence ?? 0) * 100).toFixed(0);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{p.type ?? "Unknown"}</Text>

      {/* Severity bar */}
      <View style={styles.row}>
        <Text style={styles.label}>Severity</Text>
        <View style={styles.severityRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <View
              key={n}
              style={[
                styles.severityDot,
                {
                  backgroundColor:
                    n <= severity ? SEVERITY_COLORS[severity] : "#333",
                },
              ]}
            />
          ))}
          <Text style={[styles.severityLabel, { color: SEVERITY_COLORS[severity] }]}>
            {SEVERITY_LABELS[severity]}
          </Text>
        </View>
      </View>

      {/* Confidence */}
      <View style={styles.row}>
        <Text style={styles.label}>Confidence</Text>
        <Text style={styles.value}>{confidence}%</Text>
      </View>

      {/* Source device */}
      <View style={styles.row}>
        <Text style={styles.label}>Source</Text>
        <Text style={styles.value}>{p.source ?? "unknown"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1f1f1f",
    borderRadius: 10,
    padding: 12,
    width: 220,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
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
});
