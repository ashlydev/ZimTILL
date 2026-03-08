import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { AppButton } from "../../components/AppButton";
import { useAuth } from "../../contexts/AuthContext";
import { listProducts, listStockMovements, recordInventoryAdjustment } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { colors, spacing } from "../../constants/theme";

type AdjustmentReason = "RETURN" | "EXPIRED" | "DAMAGED";

export function InventoryScreen() {
  const { session } = useAuth();
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [lowStock, setLowStock] = useState<Record<string, unknown>[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [allProducts, lowProducts, movementRows] = await Promise.all([
      listProducts(session.merchantId),
      listProducts(session.merchantId, "", true),
      listStockMovements(session.merchantId)
    ]);

    setProducts(allProducts);
    setLowStock(lowProducts);
    setMovements(movementRows);
    if (!selectedProductId && allProducts[0]?.id) {
      setSelectedProductId(String(allProducts[0].id));
    }
  }, [session, selectedProductId]);

  useRefreshOnFocus(load);

  const onRecord = async (reason: AdjustmentReason) => {
    if (!session || !selectedProductId || Number(quantity) <= 0) return;
    setBusy(true);
    try {
      await recordInventoryAdjustment(
        { merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId },
        {
          productId: selectedProductId,
          quantity: Number(quantity),
          reason,
          notes: notes || null
        }
      );
      setQuantity("1");
      setNotes("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>Live stock alerts, returns, and write-off history.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Returns / Expired / Damaged</Text>
        <FlatList
          data={products}
          horizontal
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.productChipWrap}>
              <AppButton
                label={String(item.name)}
                variant={selectedProductId === String(item.id) ? "primary" : "secondary"}
                onPress={() => setSelectedProductId(String(item.id))}
              />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
        />
        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="Quantity"
          placeholderTextColor={colors.slate}
        />
        <TextInput
          style={[styles.textInput, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Notes (optional)"
          placeholderTextColor={colors.slate}
        />
        <View style={styles.row}>
          <AppButton label={busy ? "Saving..." : "Return items"} onPress={() => void onRecord("RETURN")} disabled={busy || !selectedProductId} />
          <AppButton label="Mark expired" variant="secondary" onPress={() => void onRecord("EXPIRED")} disabled={busy || !selectedProductId} />
          <AppButton label="Mark damaged" variant="secondary" onPress={() => void onRecord("DAMAGED")} disabled={busy || !selectedProductId} />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Low Stock Alerts</Text>
        {lowStock.length === 0 ? <Text style={styles.meta}>No low stock products.</Text> : null}
        {lowStock.map((item) => (
          <Text key={String(item.id)} style={styles.meta}>
            {String(item.name)}: {Number(item.stockQty)} (threshold {Number(item.lowStockThreshold)})
          </Text>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent Stock Movements</Text>
        <FlatList
          data={movements}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Text style={styles.meta}>
              {String(item.type)} | {String(item.productName ?? ((item.product as { name?: string } | undefined)?.name ?? item.productId))} | {Number(item.quantity)} | {String(item.reason ?? "")}
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
  meta: {
    color: colors.slate,
    fontSize: 13
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  productChipWrap: {
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
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: "top"
  }
});
