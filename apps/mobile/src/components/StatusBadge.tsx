import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return (
    <View style={[styles.base, tone === "success" && styles.success, tone === "warning" && styles.warning, tone === "danger" && styles.danger]}>
      <Text style={[styles.text, tone === "success" && styles.successText, tone === "warning" && styles.warningText, tone === "danger" && styles.dangerText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    backgroundColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#D1D5DB"
  },
  success: {
    backgroundColor: "#DCFCE7"
  },
  warning: {
    backgroundColor: "#FEF3C7"
  },
  danger: {
    backgroundColor: "#FEE2E2"
  },
  text: {
    fontWeight: "700",
    color: colors.dark,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase"
  },
  successText: {
    color: colors.success
  },
  warningText: {
    color: colors.warning
  },
  dangerText: {
    color: colors.danger
  }
});
