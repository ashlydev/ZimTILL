import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { useAuth } from "../../contexts/AuthContext";
import { adjustStock, deleteProduct, listProducts, saveProduct } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { colors, spacing } from "../../constants/theme";
import { formatMoney } from "../../utils/format";

export function ProductsScreen() {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [cost, setCost] = useState("");
  const [sku, setSku] = useState("");
  const [stockQty, setStockQty] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("0");

  const load = useCallback(async () => {
    if (!session) return;
    const rows = await listProducts(session.merchantId, search, lowStockOnly);
    setItems(rows);
  }, [session, search, lowStockOnly]);

  useRefreshOnFocus(load);
  React.useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setPrice("0");
    setCost("");
    setSku("");
    setStockQty("0");
    setLowStockThreshold("0");
  };

  const startEdit = (item: Record<string, unknown>) => {
    setEditing(item);
    setName(String(item.name ?? ""));
    setPrice(String(item.price ?? 0));
    setCost(item.cost == null ? "" : String(item.cost));
    setSku(String(item.sku ?? ""));
    setStockQty(String(item.stockQty ?? 0));
    setLowStockThreshold(String(item.lowStockThreshold ?? 0));
  };

  const onSave = async () => {
    if (!session) return;
    if (!name.trim()) {
      Alert.alert("Missing name", "Product name is required.");
      return;
    }

    try {
      await saveProduct(
        { merchantId: session.merchantId, deviceId: session.deviceId },
        {
          id: editing ? String(editing.id) : undefined,
          name: name.trim(),
          price: Number(price || 0),
          cost: cost ? Number(cost) : null,
          sku: sku || null,
          stockQty: Number(stockQty || 0),
          lowStockThreshold: Number(lowStockThreshold || 0)
        }
      );
      resetForm();
      await load();
    } catch (error) {
      Alert.alert("Unable to save product", error instanceof Error ? error.message : "Unknown error");
    }
  };

  const onAdjust = async (item: Record<string, unknown>, quantity: number) => {
    if (!session) return;
    await adjustStock({ merchantId: session.merchantId, deviceId: session.deviceId }, String(item.id), quantity, "Quick adjust");
    await load();
  };

  const onDelete = async (item: Record<string, unknown>) => {
    if (!session) return;
    Alert.alert("Delete product", "Soft delete this product?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteProduct({ merchantId: session.merchantId, deviceId: session.deviceId }, String(item.id));
          await load();
        }
      }
    ]);
  };

  const symbol = "$";

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Products</Text>
        <Text style={styles.subtitle}>Manage pricing, stock, and low-stock thresholds.</Text>
      </View>
      <Card>
        <Text style={styles.sectionTitle}>Find Products</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products"
          placeholderTextColor={colors.slate}
        />
        <View style={styles.row}>
          <AppButton
            label={lowStockOnly ? "Showing low stock" : "Filter low stock"}
            variant="secondary"
            onPress={() => setLowStockOnly((prev) => !prev)}
          />
          <AppButton label="Refresh" variant="secondary" onPress={load} />
        </View>
      </Card>

      <Card>
        <Text style={styles.formTitle}>{editing ? "Edit Product" : "Add Product"}</Text>
        <AppInput label="Name" value={name} onChangeText={setName} />
        <AppInput label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <AppInput label="Cost (optional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
        <AppInput label="SKU (optional)" value={sku} onChangeText={setSku} />
        <AppInput label="Stock Qty" value={stockQty} onChangeText={setStockQty} keyboardType="decimal-pad" />
        <AppInput
          label="Low Stock Threshold"
          value={lowStockThreshold}
          onChangeText={setLowStockThreshold}
          keyboardType="decimal-pad"
        />
        <View style={styles.row}>
          <AppButton label={editing ? "Update" : "Save"} onPress={onSave} />
          {editing ? <AppButton label="Cancel" variant="secondary" onPress={resetForm} /> : null}
        </View>
      </Card>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={styles.emptyText}>No products yet. Add your first product above.</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.itemTitle}>{String(item.name)}</Text>
            <Text style={styles.itemMeta}>Price: {formatMoney(Number(item.price), symbol)}</Text>
            <Text style={styles.itemMeta}>Stock: {Number(item.stockQty)}</Text>
            <View style={styles.row}>
              <AppButton label="-1" variant="secondary" onPress={() => onAdjust(item, -1)} />
              <AppButton label="+1" variant="secondary" onPress={() => onAdjust(item, 1)} />
              <AppButton label="Edit" variant="secondary" onPress={() => startEdit(item)} />
              <AppButton label="Delete" variant="secondary" onPress={() => onDelete(item)} />
            </View>
          </Card>
        )}
        scrollEnabled={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: spacing.xs
  },
  title: {
    color: colors.navy,
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.slate,
    fontSize: 13
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.dark,
    backgroundColor: colors.background
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  formTitle: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 17
  },
  itemTitle: {
    color: colors.dark,
    fontSize: 16,
    fontWeight: "700"
  },
  itemMeta: {
    color: colors.slate,
    fontSize: 13
  },
  emptyText: {
    color: colors.slate,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: spacing.md
  }
});
