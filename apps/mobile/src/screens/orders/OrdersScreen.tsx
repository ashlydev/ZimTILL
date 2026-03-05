import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { listOrders } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { colors, spacing } from "../../constants/theme";
import { formatMoney } from "../../utils/format";

type Nav = NativeStackNavigationProp<MainStackParamList>;

function toneFromStatus(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "PAID") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "PARTIALLY_PAID" || status === "CONFIRMED") return "warning";
  return "neutral";
}

export function OrdersScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const rows = await listOrders(session.merchantId, search);
    setOrders(rows);
  }, [session, search]);

  useRefreshOnFocus(load);
  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <View>
          <Text style={styles.title}>Orders</Text>
          <Text style={styles.subtitle}>Track status, balances, and payment progress.</Text>
        </View>
        <AppButton label="New order" onPress={() => navigation.navigate("OrderCreate")} />
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Find Orders</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by order number or customer"
          placeholderTextColor={colors.slate}
        />
        <AppButton label="Refresh" variant="secondary" onPress={load} />
      </Card>

      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={styles.emptyText}>No orders yet. Create your first order.</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.itemTitle}>{String(item.orderNumber)}</Text>
            <Text style={styles.itemMeta}>Customer: {String(item.customerName ?? "Walk-in")}</Text>
            <Text style={styles.itemMeta}>Total: {formatMoney(Number(item.total))}</Text>
            <StatusBadge label={String(item.status)} tone={toneFromStatus(String(item.status))} />
            <AppButton
              label="View details"
              variant="secondary"
              onPress={() => navigation.navigate("OrderDetails", { orderId: String(item.id) })}
            />
          </Card>
        )}
        scrollEnabled={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md
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
  itemTitle: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 16
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
