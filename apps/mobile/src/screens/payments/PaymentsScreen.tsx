import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { addPayment, listOrders, listPayments } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { formatMoney } from "../../utils/format";

const methods = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER"] as const;

export function PaymentsScreen() {
  const { session } = useAuth();
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState<(typeof methods)[number]>("CASH");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;

    const [paymentRows, orderRows] = await Promise.all([listPayments(session.merchantId), listOrders(session.merchantId)]);
    const openOrders = orderRows.filter((order) => String(order.status) !== "CANCELLED");

    setPayments(paymentRows);
    setOrders(openOrders);
    if (!selectedOrderId && openOrders[0]?.id) {
      setSelectedOrderId(String(openOrders[0].id));
    }
  }, [selectedOrderId, session]);

  useRefreshOnFocus(load);

  const totalCollected = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0), [payments]);

  const onRecord = async () => {
    if (!session || !selectedOrderId || Number(amount) <= 0) return;
    setBusy(true);
    try {
      await addPayment(
        { merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId },
        {
          orderId: selectedOrderId,
          amount: Number(amount),
          method,
          reference: reference || null
        }
      );
      setAmount("");
      setReference("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Payments</Text>
        <Text style={styles.subtitle}>Record manual payments offline and sync them when online.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.total}>{formatMoney(totalCollected)}</Text>
        <Text style={styles.meta}>{payments.length} payment entries</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Record Payment</Text>
        <FlatList
          data={orders}
          horizontal
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.orderChipWrap}>
              <AppButton
                label={String(item.orderNumber)}
                variant={selectedOrderId === String(item.id) ? "primary" : "secondary"}
                onPress={() => setSelectedOrderId(String(item.id))}
              />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
        />
        <TextInput
          style={styles.textInput}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount"
          placeholderTextColor={colors.slate}
        />
        <TextInput
          style={styles.textInput}
          value={reference}
          onChangeText={setReference}
          placeholder="Reference (optional)"
          placeholderTextColor={colors.slate}
        />
        <View style={styles.row}>
          {methods.map((item) => (
            <AppButton
              key={item}
              label={item}
              variant={method === item ? "primary" : "secondary"}
              onPress={() => setMethod(item)}
            />
          ))}
        </View>
        <AppButton label={busy ? "Saving..." : "Record payment"} onPress={() => void onRecord()} disabled={busy || !selectedOrderId || Number(amount) <= 0} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent Payments</Text>
        {payments.length === 0 ? <Text style={styles.meta}>No payments recorded yet.</Text> : null}
        <FlatList
          data={payments}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Text style={styles.meta}>
              {formatMoney(Number(item.amount ?? 0))} | {String(item.method)} | {String(item.reference ?? "-")}
            </Text>
          )}
          scrollEnabled={false}
        />
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
    fontSize: 13
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  total: {
    color: colors.dark,
    fontSize: 28,
    fontWeight: "800"
  },
  meta: {
    color: colors.slate,
    fontSize: 13
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  orderChipWrap: {
    marginRight: spacing.sm
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
