import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, spacing } from "../constants/theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
};

export function AppButton({ label, onPress, disabled, loading, variant = "primary" }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : variant === "danger" ? styles.danger : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" || variant === "danger" ? "#fff" : colors.navy} /> : null}
      <Text style={[styles.text, variant === "primary" || variant === "danger" ? styles.primaryText : styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 46
  },
  primary: {
    backgroundColor: colors.navy,
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 2
  },
  secondary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.navy
  },
  danger: {
    backgroundColor: colors.danger
  },
  pressed: {
    opacity: 0.88
  },
  disabled: {
    opacity: 0.5
  },
  text: {
    fontSize: 14,
    letterSpacing: 0.2,
    fontWeight: "700"
  },
  primaryText: {
    color: "#FFFFFF"
  },
  secondaryText: {
    color: colors.navy
  }
});
