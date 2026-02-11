import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CATEGORIES } from "../constants/detectionClasses";

/**
 * Collapsible filter panel positioned above the bottom nav bar.
 *
 * Props:
 *   classFilter    – { className: boolean } map
 *   onFilterChange – (newFilter) => void
 */
export default function ClassFilterPanel({ classFilter, onFilterChange }) {
  const [open, setOpen] = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);

  const toggleCategory = (catName) => {
    const cat = CATEGORIES[catName];
    // If every class in the category is on, turn them all off; otherwise turn all on
    const allOn = cat.classes.every((c) => classFilter[c]);
    const next = { ...classFilter };
    for (const cls of cat.classes) {
      next[cls] = !allOn;
    }
    onFilterChange(next);
  };

  const toggleClass = (className) => {
    onFilterChange({ ...classFilter, [className]: !classFilter[className] });
  };

  const catEntries = Object.entries(CATEGORIES);

  // Count how many classes in a category pass the current filter
  const catActiveCount = (catName) =>
    CATEGORIES[catName].classes.filter((c) => classFilter[c]).length;

  if (!open) {
    return (
      <View style={styles.closedWrap}>
        <TouchableOpacity
          style={styles.toggleBtn}
          activeOpacity={0.7}
          onPress={() => setOpen(true)}
        >
          <Text style={styles.toggleText}>Filters</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Detection Filters</Text>
        <TouchableOpacity onPress={() => setOpen(false)}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} nestedScrollEnabled>
        {catEntries.map(([catName, cat]) => {
          const active = catActiveCount(catName);
          const total = cat.classes.length;
          const allOn = active === total;
          const isExpanded = expandedCat === catName;

          return (
            <View key={catName}>
              {/* Category row */}
              <Pressable
                style={styles.catRow}
                onPress={() => toggleCategory(catName)}
                onLongPress={() =>
                  setExpandedCat(isExpanded ? null : catName)
                }
              >
                <View style={[styles.dot, { backgroundColor: cat.color }]} />
                <View style={styles.checkbox}>
                  {allOn && <View style={styles.checkFill} />}
                  {!allOn && active > 0 && (
                    <View style={styles.checkPartial} />
                  )}
                </View>
                <Text style={styles.catLabel}>{catName}</Text>
                <Text style={styles.catCount}>
                  {active}/{total}
                </Text>
              </Pressable>

              {/* Expanded individual class toggles */}
              {isExpanded &&
                cat.classes.map((cls) => (
                  <TouchableOpacity
                    key={cls}
                    style={styles.classRow}
                    activeOpacity={0.6}
                    onPress={() => toggleClass(cls)}
                  >
                    <View style={styles.checkbox}>
                      {classFilter[cls] && <View style={styles.checkFill} />}
                    </View>
                    <Text style={styles.classLabel}>{cls}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  closedWrap: {
    position: "absolute",
    bottom: 110,
    left: 14,
  },
  toggleBtn: {
    backgroundColor: "#1f1f1f",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  toggleText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  panel: {
    position: "absolute",
    bottom: 110,
    left: 14,
    right: 14,
    maxHeight: 320,
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    padding: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  closeText: {
    color: "#71B07B",
    fontSize: 14,
    fontWeight: "600",
  },
  scroll: {
    flexGrow: 0,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#71B07B",
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checkFill: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#71B07B",
  },
  checkPartial: {
    width: 10,
    height: 4,
    borderRadius: 1,
    backgroundColor: "#71B07B",
  },
  catLabel: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
  catCount: {
    color: "#999",
    fontSize: 12,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingLeft: 36,
  },
  classLabel: {
    color: "#ccc",
    fontSize: 13,
  },
});
