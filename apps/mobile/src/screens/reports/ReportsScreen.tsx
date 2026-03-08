import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { useAuth } from "../../contexts/AuthContext";
import { getReports, getSettings } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { colors, spacing } from "../../constants/theme";
import { formatMoney } from "../../utils/format";

export function ReportsScreen() {
  const { session } = useAuth();
  const [symbol, setSymbol] = useState("$");
  const [data, setData] = useState<Awaited<ReturnType<typeof getReports>> | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [reports, settings] = await Promise.all([getReports(session.merchantId), getSettings(session.merchantId)]);
    setData(reports);
    setSymbol(String(settings.currencySymbol ?? "$"));
  }, [session]);

  useRefreshOnFocus(load);

  if (!data) {
    return (
      <Screen>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.meta}>Loading...</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Reports (offline)</Text>
        <Text style={styles.subtitle}>Computed directly from local SQLite data.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Today</Text>
        <Text style={styles.meta}>Sales: {formatMoney(data.today.salesTotal, symbol)}</Text>
        <Text style={styles.meta}>Orders: {data.today.ordersCount}</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Last 7 Days</Text>
        <Text style={styles.meta}>Sales: {formatMoney(data.last7Days.salesTotal, symbol)}</Text>
        <Text style={styles.meta}>Orders: {data.last7Days.ordersCount}</Text>
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
        <Text style={styles.sectionTitle}>Top Products</Text>
        {data.last7Days.topProducts.length === 0 ? <Text style={styles.meta}>No sales yet.</Text> : null}
        {data.last7Days.topProducts.map((item) => (
          <Text key={item.productId} style={styles.meta}>
            {item.name}: {item.qty}
          </Text>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    padding: 20,
    gap: 4
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
