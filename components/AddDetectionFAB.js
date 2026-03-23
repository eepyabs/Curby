import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PlusIcon } from "./NavIcons";

/**
 * Floating action button for adding a detection.
 *
 * Props:
 *   active  – boolean, "tap-to-place" mode is active (stopped only)
 *   moving  – boolean, user's device is currently moving
 *   onPress – callback
 *
 * Behaviour:
 *   moving=true  → bolt badge shown; one tap opens sheet at current location
 *   moving=false → plus icon; first tap enters tap-to-place mode
 */
export default function AddDetectionFAB({ active, moving, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.fab, active && styles.fabActive]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <PlusIcon size={26} color="#fff" />
      {moving && (
        <View style={styles.movingBadge}>
          <Text style={styles.movingBadgeText}>⚡</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 115,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#71B07B",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabActive: {
    backgroundColor: "#5a9a64",
    shadowColor: "#71B07B",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  movingBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  movingBadgeText: {
    fontSize: 11,
  },
});
