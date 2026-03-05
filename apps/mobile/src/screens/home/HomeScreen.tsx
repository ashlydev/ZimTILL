import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { StatusBadge } from "../../components/StatusBadge";
import { useAppContext } from "../../contexts/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { getDashboardStats, getSettings } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { useOnboardingTips } from "../../hooks/useOnboardingTips";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { formatMoney } from "../../utils/format";

export function HomeScreen() {
  const { session } = useAuth();
  const { isOnline, syncing, triggerSync, lastSyncAt, syncError } = useAppContext();
  const { visible, dismiss } = useOnboardingTips();
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [stats, setStats] = useState({
    todaySalesTotal: 0,
    todayOrdersCount: 0,
    outstandingTotal: 0,
    lowStockCount: 0
  });

  const load = useCallback(async () => {
    if (!session) return;
    const [dashboard, settings] = await Promise.all([
      getDashboardStats(session.merchantId),
      getSettings(session.merchantId)
    ]);
    setStats(dashboard);
    setCurrencySymbol(String(settings.currencySymbol ?? "$"));
  }, [session]);

  useRefreshOnFocus(load);

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subTitle}>{session?.businessName ?? "Merchant"}</Text>
          </View>
          <StatusBadge label={isOnline ? "Online" : "Offline"} tone={isOnline ? "success" : "warning"} />
        </View>
        <Text style={styles.heroAmount}>{formatMoney(stats.todaySalesTotal, currencySymbol)}</Text>
        <Text style={styles.heroMeta}>Today sales</Text>
      </View>

      {visible ? (
        <Card>
          <Text style={styles.tipTitle}>Quick start</Text>
          <Text style={styles.tipText}>1. Add products and customers.</Text>
          <Text style={styles.tipText}>2. Create an order and share on WhatsApp.</Text>
          <Text style={styles.tipText}>3. Tap Sync Now when online.</Text>
          <AppButton label="Dismiss tip" variant="secondary" onPress={dismiss} />
        </Card>
      ) : null}

      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Card>
            <Text style={styles.metricLabel}>Today Orders</Text>
            <Text style={styles.metricValue}>{stats.todayOrdersCount}</Text>
          </Card>
        </View>
        <View style={styles.gridItem}>
          <Card>
            <Text style={styles.metricLabel}>Low Stock</Text>
            <Text style={styles.metricValue}>{stats.lowStockCount}</Text>
          </Card>
        </View>
      </View>

      <Card>
        <Text style={styles.metricLabel}>Outstanding Balance</Text>
        <Text style={styles.metricValue}>{formatMoney(stats.outstandingTotal, currencySymbol)}</Text>
      </Card>

      <Card>
        <Text style={styles.metricLabel}>Sync</Text>
        <Text style={styles.syncText}>Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}</Text>
        {syncError ? <Text style={styles.errorText}>Error: {syncError}</Text> : null}
        <AppButton
          label={syncing ? "Syncing..." : "Sync now"}
          onPress={triggerSync}
          loading={syncing}
          disabled={!isOnline}
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    color: "#E5ECF6",
    fontSize: 24,
    fontWeight: "800"
  },
  subTitle: {
    color: "#C7D2E2",
    fontSize: 13
  },
  heroAmount: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    marginTop: spacing.sm
  },
  heroMeta: {
    color: "#C7D2E2",
    fontSize: 13,
    fontWeight: "600"
  },
  grid: {
    flexDirection: "row",
    gap: spacing.md
  },
  gridItem: {
    flex: 1
  },
  metricLabel: {
    color: colors.darkSoft,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  metricValue: {
    color: colors.dark,
    fontSize: 28,
    fontWeight: "800"
  },
  tipTitle: {
    color: colors.navy,
    fontWeight: "800",
    fontSize: 17
  },
  tipText: {
    color: colors.dark,
    fontSize: 14
  },
  syncText: {
    color: colors.dark,
    fontSize: 13
  },
  errorText: {
    color: colors.danger,
    fontSize: 12
  }
});
