import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { FeatureFlag, Merchant, StaffUser, Subscription, UsageCounter } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";

type MerchantRow = Merchant & { subscriptions?: Subscription[]; usageCounters?: UsageCounter[] };

export function AdminPage() {
  const { token, hasAnyRole } = useAuth();
  const [overview, setOverview] = useState<{ totals: { merchants: number; openUpgradeRequests: number }; subscriptions: Subscription[] } | null>(null);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [message, setMessage] = useState("");
  const [impersonateMerchantId, setImpersonateMerchantId] = useState("");
  const [disableUserId, setDisableUserId] = useState("");

  const refresh = async () => {
    if (!token) return;
    const [overviewRes, merchantsRes, flagsRes] = await Promise.all([
      api.getAdminOverview(token),
      api.listAdminMerchants(token),
      api.listAdminFeatureFlags(token)
    ]);
    setOverview(overviewRes);
    setMerchants(merchantsRes.merchants);
    setFlags(flagsRes.flags);
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const handleDisable = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !disableUserId) return;
    try {
      await api.adminDisableUser(token, disableUserId, false);
      setMessage("User disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disable failed");
    }
  };

  const handleImpersonate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !impersonateMerchantId) return;
    try {
      const response = await api.adminImpersonate(token, { merchantId: impersonateMerchantId });
      setMessage(`Impersonation token issued for ${response.user.identifier}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impersonation failed");
    }
  };

  if (!hasAnyRole(["OWNER", "ADMIN"])) {
    return (
      <section className="page-stack">
        <PageHeader title="Platform Admin" subtitle="Restricted access" />
        <Card>
          <p className="status-text error">This area is restricted to platform operators and owners.</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <PageHeader title="Platform Admin" subtitle="Merchant support, plan visibility, feature flags, and platform oversight." />
      {message ? <p className="status-text">{message}</p> : null}

      {overview ? (
        <div className="stats-grid">
          <StatCard label="Merchants" value={overview.totals.merchants} />
          <StatCard label="Open Upgrade Requests" value={overview.totals.openUpgradeRequests} />
          <StatCard label="Tracked Subscriptions" value={overview.subscriptions.length} />
          <StatCard label="Flags" value={flags.length} />
        </div>
      ) : null}

      <div className="split-grid">
        <Card title="Support Actions" subtitle="Operational tools for staff support">
          <form className="form-stack" onSubmit={handleDisable}>
            <Input label="Disable user id" value={disableUserId} onChange={(event) => setDisableUserId(event.target.value)} />
            <Button type="submit" variant="secondary">
              Disable User
            </Button>
          </form>
          <form className="form-stack" onSubmit={handleImpersonate}>
            <Input
              label="Impersonate merchant id"
              value={impersonateMerchantId}
              onChange={(event) => setImpersonateMerchantId(event.target.value)}
            />
            <Button type="submit" variant="primary">
              Issue Impersonation Token
            </Button>
          </form>
        </Card>

        <Card title="Feature Flags" subtitle="Global and merchant-scoped flags">
          <div className="card-stack">
            {flags.slice(0, 12).map((flag) => (
              <ListCard
                key={flag.id}
                title={flag.key}
                subtitle={flag.merchantId ? `Merchant ${flag.merchantId}` : "Global"}
                badge={<span className={`status-badge ${flag.enabled ? "status-paid" : "status-draft"}`}>{flag.enabled ? "Enabled" : "Disabled"}</span>}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card title="Merchants" subtitle="Subscription and usage context for support and billing workflows">
        <div className="card-stack">
          {merchants.map((merchant) => (
            <ListCard
              key={merchant.id}
              title={merchant.name}
              subtitle={merchant.slug || merchant.id}
              fields={[
                { label: "Latest plan", value: merchant.subscriptions?.[0]?.plan?.name ?? "Starter" },
                { label: "Last usage update", value: merchant.usageCounters?.[0] ? formatDateTime(merchant.usageCounters[0].updatedAt) : "No usage yet" }
              ]}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}
