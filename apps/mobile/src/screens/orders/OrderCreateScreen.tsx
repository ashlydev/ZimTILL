import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { useAuth } from "../../contexts/AuthContext";
import { createOrder, listCustomers, listProducts } from "../../data/repository";
import { colors, spacing } from "../../constants/theme";

type Props = NativeStackScreenProps<MainStackParamList, "OrderCreate">;

export function OrderCreateScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    const [productRows, customerRows] = await Promise.all([
      listProducts(session.merchantId),
      listCustomers(session.merchantId)
    ]);

    setProducts(productRows);
    setCustomers(customerRows);
  }, [session]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectedCount = useMemo(
    () => Object.values(quantities).filter((value) => Number(value) > 0).length,
    [quantities]
  );

  const onCreate = async () => {
    if (!session) return;

    const items = products
      .map((product) => ({
        productId: String(product.id),
        quantity: Number(quantities[String(product.id)] ?? "0")
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      Alert.alert("No items", "Select at least one product quantity.");
      return;
    }

    try {
      const order = await createOrder(
        { merchantId: session.merchantId, deviceId: session.deviceId },
        {
          customerId: selectedCustomerId,
          items,
          discountAmount: Number(discountAmount || 0),
          discountPercent: Number(discountPercent || 0),
          notes
        }
      );

      navigation.replace("OrderDetails", { orderId: String(order.id) });
    } catch (error) {
      Alert.alert("Create order failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>New Order</Text>
        <Text style={styles.subtitle}>Create an order in under 30 seconds.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Customer (optional)</Text>
        <FlatList
          data={[{ id: "", name: "Walk-in Customer" }, ...customers]}
          keyExtractor={(item) => String(item.id || "walk-in")}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => {
            const selected = (item.id ? String(item.id) : null) === selectedCustomerId;
            return (
              <View style={styles.customerChipWrap}>
                <AppButton
                  label={String(item.name)}
                  variant={selected ? "primary" : "secondary"}
                  onPress={() => setSelectedCustomerId(item.id ? String(item.id) : null)}
                />
              </View>
            );
          }}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Products ({selectedCount} selected)</Text>
        {products.map((product) => (
          <View key={String(product.id)} style={styles.productRow}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{String(product.name)}</Text>
              <Text style={styles.productMeta}>${Number(product.price).toFixed(2)} | Stock: {Number(product.stockQty)}</Text>
            </View>
            <TextInput
              style={styles.qtyInput}
              keyboardType="number-pad"
              value={quantities[String(product.id)] ?? "0"}
              onChangeText={(value) =>
                setQuantities((prev) => ({
                  ...prev,
                  [String(product.id)]: value.replace(/[^0-9.]/g, "")
                }))
              }
            />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Discount and notes</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="decimal-pad"
          value={discountAmount}
          onChangeText={setDiscountAmount}
          placeholder="Discount amount"
          placeholderTextColor={colors.slate}
        />
        <TextInput
          style={styles.textInput}
          keyboardType="decimal-pad"
          value={discountPercent}
          onChangeText={setDiscountPercent}
          placeholder="Discount %"
          placeholderTextColor={colors.slate}
        />
        <TextInput
          style={[styles.textInput, { minHeight: 70 }]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Notes"
          placeholderTextColor={colors.slate}
        />
      </Card>

      <AppButton label="Create order" onPress={onCreate} />
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
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  customerChipWrap: {
    marginRight: spacing.sm
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  productInfo: {
    flex: 1,
    gap: 2
  },
  productName: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 14
  },
  productMeta: {
    color: colors.slate,
    fontSize: 12
  },
  qtyInput: {
    width: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textAlign: "center",
    color: colors.dark,
    backgroundColor: colors.background
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
