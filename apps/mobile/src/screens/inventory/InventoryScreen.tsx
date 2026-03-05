import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { useAuth } from "../../contexts/AuthContext";
import { listProducts, listStockMovements } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { colors, spacing } from "../../constants/theme";

export function InventoryScreen() {
  const { session } = useAuth();
  const [lowStock, setLowStock] = useState<Record<string, unknown>[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const [products, movementRows] = await Promise.all([
      listProducts(session.merchantId, "", true),
      listStockMovements(session.merchantId)
    ]);

    setLowStock(products);
    setMovements(movementRows);
  }, [session]);

  useRefreshOnFocus(load);

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>Live stock alerts and movement timeline.</Text>
      </View>

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
              {String(item.type)} | {String(item.productName)} | {Number(item.quantity)} | {String(item.reason ?? "")}
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
  }
});
