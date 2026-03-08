import React, { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { listOrders, listProducts, listStockMovements, recordInventoryAdjustment } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";

export type AdjustmentReason = "RETURN" | "EXPIRED" | "DAMAGED";

type Props = {
  reason: AdjustmentReason;
  title: string;
  subtitle: string;
  ctaLabel: string;
};

function matchesReason(raw: unknown, reason: AdjustmentReason) {
  return typeof raw === "string" && raw.startsWith(reason);
}

function extractNotes(raw: unknown) {
  if (typeof raw !== "string") return "";
  const [, ...rest] = raw.split(":");
  return rest.join(":").trim();
}

export function StockAdjustmentScreen({ reason, title, subtitle, ctaLabel }: Props) {
  const { session } = useAuth();
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [productRows, movementRows, orderRows] = await Promise.all([
      listProducts(session.merchantId),
      listStockMovements(session.merchantId),
      reason === "RETURN" ? listOrders(session.merchantId) : Promise.resolve([])
    ]);

    setProducts(productRows);
    setRecords(movementRows.filter((item) => matchesReason(item.reason, reason)));
    setOrders(orderRows.filter((item) => String(item.deletedAt ?? "") === "" || item.deletedAt == null));

    if (!selectedProductId && productRows[0]?.id) {
      setSelectedProductId(String(productRows[0].id));
    }

    if (reason === "RETURN" && !selectedOrderId && orderRows[0]?.id) {
      setSelectedOrderId(String(orderRows[0].id));
    }
  }, [reason, selectedOrderId, selectedProductId, session]);

  useRefreshOnFocus(load);

  const selectedProduct = useMemo(
    () => products.find((item) => String(item.id) === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const onSave = async () => {
    if (!session || !selectedProductId || Number(quantity) <= 0) {
      Alert.alert("Missing details", "Choose a product and quantity first.");
      return;
    }

    setBusy(true);
    try {
      const parsedDate = Number.isNaN(Date.parse(occurredAt)) ? new Date().toISOString() : new Date(occurredAt).toISOString();
      await recordInventoryAdjustment(
        { merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId },
        {
          productId: selectedProductId,
          quantity: Number(quantity),
          reason,
          notes: notes || null,
          orderId: reason === "RETURN" && selectedOrderId ? selectedOrderId : null,
          occurredAt: parsedDate
        }
      );
      setQuantity("1");
      setNotes("");
      setOccurredAt(new Date().toISOString());
      await load();
      Alert.alert("Saved", `${title} recorded offline and queued for sync.`);
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : "Unable to save record.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>New Record</Text>
        <Text style={styles.meta}>Selected product: {selectedProduct ? String(selectedProduct.name) : "Choose a product"}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {products.map((item) => (
            <AppButton
              key={String(item.id)}
              label={String(item.name)}
              variant={selectedProductId === String(item.id) ? "primary" : "secondary"}
              onPress={() => setSelectedProductId(String(item.id))}
            />
          ))}
        </ScrollView>

        {reason === "RETURN" ? (
          <>
            <Text style={styles.meta}>Linked order (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <AppButton
                label="No order"
                variant={selectedOrderId ? "secondary" : "primary"}
                onPress={() => setSelectedOrderId("")}
              />
              {orders.map((item) => (
                <AppButton
                  key={String(item.id)}
                  label={String(item.orderNumber)}
                  variant={selectedOrderId === String(item.id) ? "primary" : "secondary"}
                  onPress={() => setSelectedOrderId(String(item.id))}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="Quantity"
          placeholderTextColor={colors.slate}
        />
        <TextInput
          style={styles.textInput}
          value={occurredAt}
          onChangeText={setOccurredAt}
          placeholder="2026-03-08T10:30:00.000Z"
          placeholderTextColor={colors.slate}
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.textInput, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Notes (optional)"
          placeholderTextColor={colors.slate}
        />
        <AppButton label={busy ? "Saving..." : ctaLabel} onPress={() => void onSave()} disabled={busy || !selectedProductId} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent Records</Text>
        {records.length === 0 ? <Text style={styles.meta}>No records yet.</Text> : null}
        <View style={styles.listWrap}>
          {records.map((item) => (
            <View key={String(item.id)} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{String(item.productName ?? item.productId)}</Text>
                <Text style={styles.meta}>{new Date(String(item.createdAt)).toLocaleString()}</Text>
                {item.orderId ? <Text style={styles.meta}>Order: {String(item.orderId)}</Text> : null}
                {item.reason ? <Text style={styles.meta}>{extractNotes(item.reason)}</Text> : null}
              </View>
              <Text style={styles.qty}>{Math.abs(Number(item.quantity ?? 0))}</Text>
            </View>
          ))}
        </View>
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
  meta: {
    color: colors.slate,
    fontSize: 13
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: 2
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.dark,
    backgroundColor: colors.background,
    minHeight: 48
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: "top"
  },
  listWrap: {
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowMain: {
    flex: 1,
    gap: 4
  },
  rowTitle: {
    color: colors.dark,
    fontSize: 15,
    fontWeight: "700"
  },
  qty: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: "800"
  }
});
