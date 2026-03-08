import React, { useCallback, useState } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { StatusBadge } from "../../components/StatusBadge";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useAppContext } from "../../contexts/AppContext";
import {
  addPayment,
  buildWhatsappOrderText,
  cancelOrder,
  confirmOrder,
  getOrderDetails
} from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { formatMoney } from "../../utils/format";

type Props = NativeStackScreenProps<MainStackParamList, "OrderDetails">;

function toneFromStatus(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "PAID") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "PARTIALLY_PAID" || status === "CONFIRMED") return "warning";
  return "neutral";
}

export function OrderDetailsScreen({ route, navigation }: Props) {
  const { session } = useAuth();
  const { isOnline } = useAppContext();
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getOrderDetails>> | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ECOCASH" | "ZIPIT" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [paymentReference, setPaymentReference] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    const next = await getOrderDetails(session.merchantId, route.params.orderId);
    setDetails(next);
  }, [session, route.params.orderId]);

  useRefreshOnFocus(load);

  const onAddPayment = async () => {
    if (!session || !details) return;
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      Alert.alert("Invalid amount", "Enter payment amount.");
      return;
    }

    try {
      await addPayment(
        { merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId },
        {
          orderId: String(details.order.id),
          amount: Number(paymentAmount),
          method: paymentMethod,
          reference: paymentReference || null
        }
      );

      setPaymentAmount("");
      setPaymentReference("");
      await load();
    } catch (error) {
      Alert.alert("Payment not saved", error instanceof Error ? error.message : "Try again.");
    }
  };

  const onShareWhatsapp = async () => {
    if (!session) return;
    const data = await buildWhatsappOrderText(session.merchantId, route.params.orderId);
    const text = encodeURIComponent(data.message);
    const url = data.phone ? `whatsapp://send?phone=${data.phone}&text=${text}` : `whatsapp://send?text=${text}`;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://wa.me/?text=${text}`);
    }
  };

  if (!details) {
    return (
      <Screen>
        <Text style={styles.title}>Order Details</Text>
        <Text style={styles.meta}>Loading...</Text>
      </Screen>
    );
  }

  const order = details.order;
  const hasUnavailableItems = details.items.some((item) => !item.productName);

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.title}>Order {String(order.orderNumber)}</Text>
          <StatusBadge label={String(order.status)} tone={toneFromStatus(String(order.status))} />
        </View>
        <Text style={styles.heroBalance}>{formatMoney(details.balance)}</Text>
        <Text style={styles.heroMeta}>Balance due</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Totals</Text>
        <Text style={styles.meta}>Subtotal: {formatMoney(Number(order.subtotal))}</Text>
        <Text style={styles.meta}>Discount: {formatMoney(Number(order.discountAmount))}</Text>
        <Text style={styles.meta}>Total: {formatMoney(Number(order.total))}</Text>
        <Text style={styles.meta}>Paid: {formatMoney(details.paid)}</Text>
        <Text style={styles.balance}>Outstanding: {formatMoney(details.balance)}</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Items</Text>
        {details.items.map((item) => (
          <Text key={String(item.id)} style={styles.meta}>
            {Number(item.quantity)}x {String(item.productName ?? "Unavailable product")} @ {formatMoney(Number(item.unitPrice))} = {formatMoney(Number(item.lineTotal))}
          </Text>
        ))}
        {hasUnavailableItems ? <Text style={styles.warning}>One or more items are unavailable. Fix the order before confirming it.</Text> : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Payments</Text>
        {details.payments.length === 0 ? <Text style={styles.meta}>No payments yet</Text> : null}
        {details.payments.map((payment) => (
          <Text key={String(payment.id)} style={styles.meta}>
            {formatMoney(Number(payment.amount))} | {String(payment.method)} | {String(payment.status)}
          </Text>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.row}>
          <AppButton label="Mark confirmed" variant="secondary" onPress={async () => {
            if (!session) return;
            try {
              await confirmOrder({ merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId }, route.params.orderId);
              await load();
            } catch (error) {
              Alert.alert("Order not confirmed", error instanceof Error ? error.message : "Try again.");
            }
          }} disabled={hasUnavailableItems} />
          <AppButton label="Cancel order" variant="secondary" onPress={async () => {
            if (!session) return;
            await cancelOrder({ merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId }, route.params.orderId);
            await load();
          }} />
        </View>
        <View style={styles.row}>
          <AppButton label="Share to WhatsApp" onPress={onShareWhatsapp} />
          <AppButton
            label="Pay with Paynow"
            variant="secondary"
            onPress={() => navigation.navigate("PaynowCheckout", { orderId: String(order.id), amount: Number(details.balance) })}
            disabled={!isOnline}
          />
        </View>
        {!isOnline ? <Text style={styles.meta}>Online payments require internet.</Text> : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Add Payment</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="decimal-pad"
          value={paymentAmount}
          onChangeText={setPaymentAmount}
          placeholder="Amount"
          placeholderTextColor={colors.slate}
        />
        <TextInput
          style={styles.textInput}
          value={paymentReference}
          onChangeText={setPaymentReference}
          placeholder="Reference (optional)"
          placeholderTextColor={colors.slate}
        />
        <View style={styles.row}>
          {(["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER"] as const).map((method) => (
            <AppButton
              key={method}
              label={method}
              variant={paymentMethod === method ? "primary" : "secondary"}
              onPress={() => setPaymentMethod(method)}
            />
          ))}
        </View>
        <AppButton label="Save payment" onPress={onAddPayment} />
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
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800"
  },
  heroBalance: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    marginTop: spacing.sm
  },
  heroMeta: {
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
  balance: {
    color: colors.dark,
    fontSize: 16,
    fontWeight: "800"
  },
  warning: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "700"
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
