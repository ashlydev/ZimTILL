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

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!businessName.trim() || !identifier.trim() || !pin.trim()) {
      Alert.alert("Missing details", "Fill all fields.");
      return;
    }

    setLoading(true);
    try {
      await register(businessName.trim(), identifier.trim(), pin.trim());
    } catch (error) {
      Alert.alert("Registration failed", error instanceof Error ? error.message : "Unable to register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Create Merchant Account</Text>
        <Text style={styles.subtitle}>Use phone or email and a 4-6 digit PIN.</Text>
      </View>

      <Card>
        <AppInput label="Business Name" value={businessName} onChangeText={setBusinessName} />
        <AppInput label="Phone or Email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
        <AppInput
          label="PIN (4-6 digits)"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />

        <AppButton label="Create account" onPress={handleRegister} loading={loading} />
        <AppButton label="Back to login" variant="secondary" onPress={() => navigation.navigate("Login")} />
      </Card>
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
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: "#C7D2E2",
    fontSize: 14
  }
});
