import { StyleSheet, TouchableOpacity } from "react-native";
import { PlusIcon } from "./NavIcons";

/**
 * Floating action button for adding a detection.
 *
 * Props:
 *   active  – boolean, whether "add mode" is on (glows when active)
 *   onPress – callback
 */
export default function AddDetectionFAB({ active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.fab, active && styles.fabActive]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <PlusIcon size={28} color="#fff" />
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
});
