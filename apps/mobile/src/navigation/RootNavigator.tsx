import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { AuthNavigator } from "./AuthNavigator";
import { MainNavigator } from "./MainNavigator";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../constants/theme";

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.navy,
    text: colors.dark,
    card: "#FFFFFF",
    border: colors.border
  }
};

export function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  return <NavigationContainer theme={theme}>{session ? <MainNavigator /> : <AuthNavigator />}</NavigationContainer>;
}
