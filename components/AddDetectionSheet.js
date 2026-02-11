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
import { CATEGORIES } from "../constants/detectionClasses";

const SEVERITY_LEVELS = [
  { value: 1, label: "1", description: "Low" },
  { value: 2, label: "2", description: "Minor" },
  { value: 3, label: "3", description: "Moderate" },
  { value: 4, label: "4", description: "High" },
  { value: 5, label: "5", description: "Critical" },
];

/**
 * Bottom-sheet modal for reporting a new detection.
 *
 * Props:
 *   visible      – boolean
 *   coordinate   – [lon, lat]
 *   onSubmit     – ({ type, severity, latitude, longitude }) => void
 *   onCancel     – () => void
 */
export default function AddDetectionSheet({ visible, coordinate, onSubmit, onCancel }) {
  const [selectedType, setSelectedType] = useState(null);
  const [severity, setSeverity] = useState(3);

  const handleSubmit = () => {
    if (!selectedType || !coordinate) return;
    onSubmit({
      type: selectedType,
      severity,
      latitude: coordinate[1],
      longitude: coordinate[0],
    });
    setSelectedType(null);
    setSeverity(3);
  };

  const handleCancel = () => {
    setSelectedType(null);
    setSeverity(3);
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Report Detection</Text>
            <TouchableOpacity onPress={handleCancel} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Location display */}
          {coordinate && (
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Location</Text>
              <Text style={styles.locationValue}>
                {coordinate[1].toFixed(5)}, {coordinate[0].toFixed(5)}
              </Text>
            </View>
          )}

          {/* Type picker */}
          <Text style={styles.sectionTitle}>Type</Text>
          <ScrollView style={styles.typeList} nestedScrollEnabled>
            {Object.entries(CATEGORIES).map(([catName, cat]) => (
              <View key={catName}>
                <View style={styles.catHeader}>
                  <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.catName}>{catName}</Text>
                </View>
                {cat.classes.map((cls) => (
                  <TouchableOpacity
                    key={cls}
                    style={[
                      styles.classItem,
                      selectedType === cls && styles.classItemSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setSelectedType(cls)}
                  >
                    <Text
                      style={[
                        styles.classText,
                        selectedType === cls && styles.classTextSelected,
                      ]}
                    >
                      {cls}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>

          {/* Severity picker */}
          <Text style={styles.sectionTitle}>Severity</Text>
          <View style={styles.severityRow}>
            {SEVERITY_LEVELS.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[
                  styles.severityBtn,
                  severity === s.value && styles.severityBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={() => setSeverity(s.value)}
              >
                <Text
                  style={[
                    styles.severityNum,
                    severity === s.value && styles.severityNumActive,
                  ]}
                >
                  {s.label}
                </Text>
                <Text
                  style={[
                    styles.severityDesc,
                    severity === s.value && styles.severityDescActive,
                  ]}
                >
                  {s.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.submitBtn, !selectedType && styles.submitBtnDisabled]}
              activeOpacity={0.7}
              onPress={handleSubmit}
              disabled={!selectedType}
            >
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.7}
              onPress={handleCancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    color: "#aaa",
    fontSize: 20,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  locationLabel: {
    color: "#aaa",
    fontSize: 12,
  },
  locationValue: {
    color: "#71B07B",
    fontSize: 13,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 4,
  },
  typeList: {
    maxHeight: 220,
    marginBottom: 12,
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  catName: {
    color: "#ccc",
    fontSize: 13,
    fontWeight: "700",
  },
  classItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginVertical: 1,
  },
  classItemSelected: {
    backgroundColor: "rgba(113,176,123,0.2)",
  },
  classText: {
    color: "#aaa",
    fontSize: 14,
  },
  classTextSelected: {
    color: "#71B07B",
    fontWeight: "600",
  },
  severityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 6,
  },
  severityBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
  },
  severityBtnActive: {
    backgroundColor: "#71B07B",
  },
  severityNum: {
    color: "#aaa",
    fontSize: 16,
    fontWeight: "700",
  },
  severityNumActive: {
    color: "#fff",
  },
  severityDesc: {
    color: "#666",
    fontSize: 9,
    marginTop: 2,
  },
  severityDescActive: {
    color: "#fff",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  submitBtn: {
    flex: 2,
    backgroundColor: "#71B07B",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#333",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    color: "#aaa",
    fontSize: 16,
    fontWeight: "600",
  },
});
