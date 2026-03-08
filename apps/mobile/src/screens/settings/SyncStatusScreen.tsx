import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { useAppContext } from "../../contexts/AppContext";
import { getSyncState, listOutbox } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";

export function SyncStatusScreen() {
  const { isOnline, syncing, syncError, triggerSync } = useAppContext();
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [lastPushAt, setLastPushAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingPreview, setPendingPreview] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [syncState, outbox] = await Promise.all([getSyncState(), listOutbox(20)]);
    setLastPullAt(syncState.last_pull_at ?? null);
    setLastPushAt(syncState.last_push_at ?? null);
    setPendingCount(outbox.length);
    setPendingPreview(outbox.slice(0, 5).map((item) => `${item.entityType} · ${item.opType}`));
  }, []);

  useRefreshOnFocus(load);

  const onSync = async () => {
    await triggerSync();
    await load();
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Sync Status</Text>
        <Text style={styles.subtitle}>Merchant data syncs device to server, then back down to other owner and staff devices.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Current Status</Text>
        <Text style={styles.metric}>{isOnline ? "Online" : "Offline"}</Text>
        <Text style={styles.meta}>Pending outbox operations: {pendingCount}</Text>
        <Text style={styles.meta}>Last push: {lastPushAt ? new Date(lastPushAt).toLocaleString() : "Never"}</Text>
        <Text style={styles.meta}>Last pull: {lastPullAt ? new Date(lastPullAt).toLocaleString() : "Never"}</Text>
        {syncError ? <Text style={styles.error}>Last error: {syncError}</Text> : null}
        <AppButton label={syncing ? "Syncing..." : "Sync now"} onPress={() => void onSync()} loading={syncing} disabled={!isOnline} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Pending Queue</Text>
        {pendingPreview.length === 0 ? <Text style={styles.meta}>Outbox is clear.</Text> : null}
        {pendingPreview.map((entry) => (
          <Text key={entry} style={styles.meta}>
            {entry}
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
  metric: {
    color: colors.navy,
    fontSize: 26,
    fontWeight: "800"
  },
  meta: {
    color: colors.slate,
    fontSize: 13
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700"
  }
});
