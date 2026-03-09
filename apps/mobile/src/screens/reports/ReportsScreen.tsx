import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../../components/AppButton";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { colors, spacing } from "../../constants/theme";
import { useAppContext } from "../../contexts/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { getReports, getSettings } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { formatMoney } from "../../utils/format";

type RangeKey = "last7Days" | "last30Days";

export function ReportsScreen() {
  const { session } = useAuth();
  const { isOnline } = useAppContext();
  const [symbol, setSymbol] = useState("$");
  const [range, setRange] = useState<RangeKey>("last7Days");
  const [data, setData] = useState<Awaited<ReturnType<typeof getReports>> | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [reports, settings] = await Promise.all([getReports(session.merchantId), getSettings(session.merchantId)]);
    setData(reports);
    setSymbol(String(settings.currencySymbol ?? "$"));
  }, [session]);

  useRefreshOnFocus(load);

  const active = useMemo(() => {
    if (!data) return null;
    return data[range];
  }, [data, range]);

  if (!data || !active) {
    return (
      <Screen>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.meta}>Loading reports...</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Sales are based on payments received. Reports stay readable offline and refresh again when internet returns.</Text>
      </View>

      {!isOnline ? (
        <Card>
          <Text style={styles.warningTitle}>Offline cache</Text>
          <Text style={styles.meta}>Showing the last local report snapshot. Connect to refresh from the server and other devices.</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>Range</Text>
        <View style={styles.segmentRow}>
          <AppButton label="Last 7 days" variant={range === "last7Days" ? "primary" : "secondary"} onPress={() => setRange("last7Days")} />
          <AppButton label="Last 30 days" variant={range === "last30Days" ? "primary" : "secondary"} onPress={() => setRange("last30Days")} />
        </View>
      </Card>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sales</Text>
          <Text style={styles.statValue}>{formatMoney(active.salesTotal, symbol)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Orders</Text>
          <Text style={styles.statValue}>{active.ordersCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Outstanding</Text>
          <Text style={styles.statValue}>{formatMoney(active.outstandingTotal, symbol)}</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Daily Sales</Text>
        <Text style={styles.meta}>Payments received by day for the selected range.</Text>
        <View style={styles.listWrap}>
          {data.daily.slice(range === "last7Days" ? -7 : -30).map((row) => (
            <View key={row.date} style={styles.tableRow}>
              <View style={styles.tableMain}>
                <Text style={styles.rowTitle}>{row.date}</Text>
                <Text style={styles.meta}>Orders {row.ordersCount} · Outstanding {formatMoney(row.outstandingTotal, symbol)}</Text>
                <Text style={styles.meta}>Returns {row.returnsQty} · Expired {row.expiredQty} · Damaged {row.damagedQty}</Text>
              </View>
              <Text style={styles.rowValue}>{formatMoney(row.paymentsTotal, symbol)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Top Products</Text>
        {active.topProducts.length === 0 ? <Text style={styles.meta}>No sales yet.</Text> : null}
        <View style={styles.listWrap}>
          {active.topProducts.map((item) => (
            <View key={item.productId} style={styles.tableRow}>
              <View style={styles.tableMain}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.meta}>{item.categoryName ?? "Uncategorized"}</Text>
                <Text style={styles.meta}>Qty {item.qty}</Text>
              </View>
              <Text style={styles.rowValue}>{formatMoney(item.revenue, symbol)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Top Categories</Text>
        {active.topCategories.length === 0 ? <Text style={styles.meta}>No category sales yet.</Text> : null}
        <View style={styles.listWrap}>
          {active.topCategories.map((item) => (
            <View key={`${item.categoryId ?? item.name}`} style={styles.tableRow}>
              <View style={styles.tableMain}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.meta}>Qty {item.qty}</Text>
              </View>
              <Text style={styles.rowValue}>{formatMoney(item.revenue, symbol)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Stock Losses & Returns</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Returned</Text>
            <Text style={styles.summaryValue}>{data.returnsExpired.returnsCount}</Text>
            <Text style={styles.meta}>{formatMoney(data.returnsExpired.returnsValue, symbol)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Expired</Text>
            <Text style={styles.summaryValue}>{data.returnsExpired.expiredCount}</Text>
            <Text style={styles.meta}>{formatMoney(data.returnsExpired.expiredValue, symbol)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Damaged</Text>
            <Text style={styles.summaryValue}>{data.returnsExpired.damagedCount}</Text>
            <Text style={styles.meta}>{formatMoney(data.returnsExpired.damagedValue, symbol)}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Low Stock</Text>
        {data.lowStock.length === 0 ? <Text style={styles.meta}>No low stock items right now.</Text> : null}
        <View style={styles.listWrap}>
          {data.lowStock.map((item) => (
            <View key={item.productId} style={styles.tableRow}>
              <View style={styles.tableMain}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.meta}>{item.categoryName ?? "Uncategorized"}</Text>
              </View>
              <Text style={styles.rowValue}>
                {item.stockQty}/{item.lowStockThreshold}
              </Text>
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
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  warningTitle: {
    color: colors.warning,
    fontWeight: "800",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  meta: {
    color: colors.slate,
    fontSize: 13,
    lineHeight: 18
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  statCard: {
    minWidth: 150,
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md,
    gap: 4
  },
  statLabel: {
    color: colors.slate,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  statValue: {
    color: colors.navy,
    fontSize: 24,
    fontWeight: "800"
  },
  listWrap: {
    gap: spacing.sm
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    backgroundColor: colors.background
  },
  tableMain: {
    flex: 1,
    gap: 4
  },
  rowTitle: {
    color: colors.dark,
    fontSize: 15,
    fontWeight: "700"
  },
  rowValue: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: "800"
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  summaryCard: {
    minWidth: 120,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.background
  },
  summaryLabel: {
    color: colors.slate,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  summaryValue: {
    color: colors.navy,
    fontSize: 24,
    fontWeight: "800"
  }
});
