import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppInput } from "../../components/AppInput";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useAppContext } from "../../contexts/AppContext";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { isOnline } = useAppContext();
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !pin.trim()) {
      Alert.alert("Missing details", "Enter phone/email and PIN.");
      return;
    }

    setLoading(true);
    try {
      await login(identifier.trim(), pin.trim());
    } catch (error) {
      Alert.alert("Login failed", error instanceof Error ? error.message : "Unable to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Novoriq Stock Plattform</Text>
        <Text style={styles.subtitle}>Offline-first stock, orders, payments, and reporting for Zimbabwean SMEs.</Text>
      </View>

      <Card>
        <View style={[styles.statusNote, !isOnline ? styles.statusOffline : styles.statusOnline]}>
          <Text style={styles.statusTitle}>{isOnline ? "Online" : "Offline mode"}</Text>
          <Text style={styles.statusBody}>
            {isOnline
              ? "Sign in once on this device and later you can keep working offline."
              : "Use an account that has already signed in on this device. Online payments still need internet."}
          </Text>
        </View>

        <AppInput label="Phone or Email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
        <AppInput
          label="PIN"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />

        <AppButton label="Login" onPress={handleLogin} loading={loading} />
        <AppButton label="Create account" variant="secondary" onPress={() => navigation.navigate("Register")} />
      </Card>

      <Text
        style={styles.stub}
        onPress={() => Alert.alert("Forgot PIN", "PIN reset flow is planned for V1.1. Contact support to reset.")}
      >
        Forgot PIN? (V1 stub)
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.xs
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800"
  },
  subtitle: {
    color: "#C7D2E2",
    fontSize: 14,
    lineHeight: 20
  },
  stub: {
    color: colors.navy,
    textAlign: "center",
    fontSize: 13,
    textDecorationLine: "underline",
    marginTop: spacing.sm
  },
  statusNote: {
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  statusOnline: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE"
  },
  statusOffline: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: colors.border
  },
  statusTitle: {
    color: colors.dark,
    fontSize: 13,
    fontWeight: "800"
  },
  statusBody: {
    color: colors.slate,
    fontSize: 13,
    lineHeight: 18
  }
});
