import React, { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../constants/theme";

export function Screen({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgOrbTop} />
      <View style={styles.bgOrbBottom} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }, style]}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundAlt
  },
  bgOrbTop: {
    position: "absolute",
    top: -130,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(11, 31, 59, 0.08)"
  },
  bgOrbBottom: {
    position: "absolute",
    bottom: -130,
    left: -110,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(18, 50, 93, 0.07)"
  },
  content: {
    padding: 16,
    gap: 16,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center"
  }
});
