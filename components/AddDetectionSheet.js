import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { USER_REPORT_CATEGORIES } from "../constants/detectionClasses";

/**
 * Waze-style bottom sheet for reporting a hazard.
 *
 * Flow:
 *   1. User taps a type tile → if no severity needed, submits immediately
 *   2. If severity needed, severity chips appear → tapping one submits immediately
 *
 * Props:
 *   visible      – boolean
 *   coordinate   – [lon, lat]
 *   onSubmit     – ({ type, severity, latitude, longitude, expiryMinutes }) => void
 *   onCancel     – () => void
 */
export default function AddDetectionSheet({ visible, coordinate, onSubmit, onCancel }) {
  const [pendingType, setPendingType] = useState(null);

  const handleTypePress = (type, catColor) => {
    if (!coordinate) return;
    if (!type.hasSeverity) {
      submitReport(type.key, null, type.expiryMinutes);
    } else {
      setPendingType({ ...type, color: catColor });
    }
  };

  const handleSeverityPress = (idx) => {
    if (!pendingType || !coordinate) return;
    // index 0 = minor/first → severity 2, index 1 = major/second → severity 5
    const severity = idx === 0 ? 2 : 5;
    submitReport(pendingType.key, severity, pendingType.expiryMinutes);
  };

  const submitReport = (type, severity, expiryMinutes) => {
    onSubmit({
      type,
      severity,
      latitude: coordinate[1],
      longitude: coordinate[0],
      expiryMinutes,
    });
    setPendingType(null);
  };

  const handleCancel = () => {
    setPendingType(null);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.overlay} onPress={handleCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {pendingType
                ? `${pendingType.emoji}  ${pendingType.label}`
                : "Report Hazard"}
            </Text>
            <TouchableOpacity onPress={handleCancel} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {pendingType ? (
            /* ── Step 2: Severity quick-pick ── */
            <View style={styles.severityStep}>
              <Text style={styles.severityPrompt}>How bad?</Text>
              <View style={styles.severityBtnRow}>
                {pendingType.severityLabels.map((label, idx) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.severityChip, { borderColor: pendingType.color }]}
                    activeOpacity={0.7}
                    onPress={() => handleSeverityPress(idx)}
                  >
                    <Text style={[styles.severityChipText, { color: pendingType.color }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.backBtn} onPress={() => setPendingType(null)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Step 1: Type grid ── */
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {USER_REPORT_CATEGORIES.map((cat) => (
                <View key={cat.label} style={styles.catSection}>
                  <View style={styles.catHeaderRow}>
                    <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.catLabel}>{cat.label}</Text>
                  </View>
                  <View style={styles.tilesRow}>
                    {cat.types.map((type) => (
                      <TouchableOpacity
                        key={type.key}
                        style={styles.tile}
                        activeOpacity={0.7}
                        onPress={() => handleTypePress(type, cat.color)}
                      >
                        <View style={[styles.tileIconBg, { backgroundColor: cat.color + "28" }]}>
                          <Text style={styles.tileEmoji}>{type.emoji}</Text>
                        </View>
                        <Text style={styles.tileLabel} numberOfLines={2}>
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_SIZE = 82;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    color: "#888",
    fontSize: 20,
    fontWeight: "700",
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  catSection: {
    marginBottom: 16,
  },
  catHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catLabel: {
    color: "#bbb",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tilesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: TILE_SIZE,
    alignItems: "center",
  },
  tileIconBg: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  tileEmoji: {
    fontSize: 30,
  },
  tileLabel: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  // Severity step
  severityStep: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  severityPrompt: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 14,
    textAlign: "center",
  },
  severityBtnRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginBottom: 20,
  },
  severityChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  severityChipText: {
    fontSize: 16,
    fontWeight: "700",
  },
  backBtn: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backBtnText: {
    color: "#888",
    fontSize: 14,
  },
});
