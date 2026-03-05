import React, { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radii, shadows, spacing } from "../constants/theme";

export function Card({ children }: PropsWithChildren) {
  return (
    <View style={styles.shell}>
      <View style={styles.accent} />
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "relative"
  },
  accent: {
    position: "absolute",
    top: 14,
    bottom: 14,
    left: 0,
    width: 4,
    borderRadius: 999,
    backgroundColor: colors.navy
  },
  card: {
    marginLeft: spacing.xs,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card
  }
});
