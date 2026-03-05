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

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
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
        <Text style={styles.title}>Novoriq Orders</Text>
        <Text style={styles.subtitle}>Offline-first orders, payments and stock for Zimbabwean SMEs.</Text>
      </View>

      <Card>
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
  }
});
