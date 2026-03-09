import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Button } from "../components/ui/Button";
import { getPendingOutboxCount } from "../lib/offlineCore";
import { getSyncMetadata } from "../lib/storage";

export function SyncStatusPage() {
  const { merchant, isOnline, syncing, syncNow, syncError, lastSyncAt } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);

  const refresh = async () => {
    if (!merchant?.id) return;
    setPendingCount(await getPendingOutboxCount(merchant.id));
    const meta = getSyncMetadata(merchant.id);
    setLastPullAt(meta.lastPullAt ?? null);
  };

  useEffect(() => {
    void refresh();
  }, [merchant?.id, lastSyncAt]);

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button disabled={!isOnline || syncing} onClick={() => void syncNow()} variant="primary">
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        }
        subtitle="Track the local outbox and the last successful merchant-wide sync on this device."
        title="Sync Status"
      />

      <div className="stats-grid">
        <StatCard label="Connection" value={isOnline ? "Online" : "Offline"} />
        <StatCard label="Pending Outbox" value={pendingCount} />
        <StatCard label="Last Sync" value={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"} />
        <StatCard label="Last Pull" value={lastPullAt ? new Date(lastPullAt).toLocaleString() : "Never"} />
      </div>

      <Card title="Current Device" subtitle="Offline writes queue locally first, then sync to the API when a connection returns.">
        {syncError ? <p className="status-text error">{syncError}</p> : <p className="subtle-text">No sync errors recorded on this device.</p>}
      </Card>
    </section>
  );
}
