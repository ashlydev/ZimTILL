import React, { useState } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { apiRequest } from "../../services/api";
import { useAppContext } from "../../contexts/AppContext";

type Props = NativeStackScreenProps<MainStackParamList, "PaynowCheckout">;

type Method = "ecocash" | "onemoney" | "web" | "card" | "other";

export function PaynowCheckoutScreen({ route }: Props) {
  const { session } = useAuth();
  const { triggerSync, isOnline } = useAppContext();
  const [amount, setAmount] = useState(String(route.params.amount > 0 ? route.params.amount : 0));
  const [method, setMethod] = useState<Method>("ecocash");
  const [phone, setPhone] = useState("");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [pollUrl, setPollUrl] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string>("");
  const [initiating, setInitiating] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const initiate = async () => {
    if (!session) return;
    if (!isOnline) {
      Alert.alert("Internet required", "Paynow and EcoCash checkout only work when the device is online.");
      return;
    }

    setInitiating(true);
    try {
      const response = await apiRequest<{ transactionId: string; pollUrl: string; redirectUrl?: string; instructions: string }>(
        "/payments/paynow/initiate",
        {
          method: "POST",
          token: session.token,
          body: {
            orderId: route.params.orderId,
            amount: Number(amount || 0),
            method,
            phone: phone || undefined
          }
        }
      );

      setTransactionId(response.transactionId);
      setPollUrl(response.pollUrl);
      setInstructions(response.instructions);

      if (response.redirectUrl) {
        await Linking.openURL(response.redirectUrl);
      }

      Alert.alert("Paynow started", "Follow the payment prompt, then check status.");
    } catch (error) {
      Alert.alert("Payment failed", error instanceof Error ? error.message : "Unable to start Paynow.");
    } finally {
      setInitiating(false);
    }
  };

  const checkStatus = async () => {
    if (!session || !transactionId) return;
    if (!isOnline) {
      Alert.alert("Internet required", "Reconnect to check Paynow payment status.");
      return;
    }

    setCheckingStatus(true);
    try {
      const response = await apiRequest<{ status: string }>("/payments/paynow/status", {
        method: "POST",
        token: session.token,
        body: { transactionId }
      });

      Alert.alert("Payment status", response.status);

      if (response.status === "PAID") {
        await triggerSync();
      }
    } catch (error) {
      Alert.alert("Status check failed", error instanceof Error ? error.message : "Unable to check payment status.");
    } finally {
      setCheckingStatus(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Pay with Paynow</Text>
        <Text style={styles.subtitle}>Initiate mobile money or web/card checkout and confirm status.</Text>
      </View>

      <Card>
        {!isOnline ? (
          <Text style={styles.offlineNotice}>This screen needs internet. Orders and stock stay offline-first, but Paynow runs online only.</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Amount</Text>
        <TextInput
          style={styles.textInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Amount"
          placeholderTextColor={colors.slate}
        />

        <Text style={styles.sectionTitle}>Method</Text>
        <View style={styles.row}>
          {(["ecocash", "onemoney", "web", "card", "other"] as const).map((item) => (
            <AppButton
              key={item}
              label={item}
              variant={method === item ? "primary" : "secondary"}
              onPress={() => setMethod(item)}
            />
          ))}
        </View>

        {(method === "ecocash" || method === "onemoney") ? (
          <TextInput
            style={styles.textInput}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Mobile money phone"
            placeholderTextColor={colors.slate}
          />
        ) : null}

        <AppButton label="Initiate payment" onPress={initiate} loading={initiating} disabled={!isOnline} />
      </Card>

      {transactionId ? (
        <Card>
          <Text style={styles.sectionTitle}>Transaction</Text>
          <Text style={styles.meta}>ID: {transactionId}</Text>
          {pollUrl ? <Text style={styles.meta}>Poll URL ready</Text> : null}
          {instructions ? <Text style={styles.meta}>{instructions}</Text> : null}
          <AppButton
            label="Check payment status"
            variant="secondary"
            onPress={checkStatus}
            loading={checkingStatus}
            disabled={!isOnline}
          />
        </Card>
      ) : null}
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
    fontSize: 13
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  meta: {
    color: colors.slate,
    fontSize: 13
  },
  offlineNotice: {
    color: colors.slate,
    fontSize: 13,
    lineHeight: 18
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.dark,
    backgroundColor: colors.background,
    minHeight: 46
  }
});
