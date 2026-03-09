import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { FeatureFlag, Merchant, StaffUser, Subscription, UsageCounter } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select, TextArea } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";

type MerchantRow = Merchant & {
  users?: StaffUser[];
  subscriptions?: Subscription[];
  usageCounters?: UsageCounter[];
};

const planOptions = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const;

export function AdminPage() {
  const { token, hasAnyRole } = useAuth();
  const [overview, setOverview] = useState<{ totals: { merchants: number; openUpgradeRequests: number }; subscriptions: Subscription[] } | null>(null);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const [planCode, setPlanCode] = useState<(typeof planOptions)[number]>("STARTER");
  const [durationDays, setDurationDays] = useState("30");
  const [trialDays, setTrialDays] = useState("7");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [disableUserId, setDisableUserId] = useState("");
  const [impersonateMerchantId, setImpersonateMerchantId] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (!selectedMerchantId && merchantsRes.merchants[0]?.id) {
      setSelectedMerchantId(merchantsRes.merchants[0].id);
      setImpersonateMerchantId(merchantsRes.merchants[0].id);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  const visibleMerchants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return merchants;
    return merchants.filter((merchant) =>
      `${merchant.name} ${merchant.slug ?? ""} ${merchant.id}`.toLowerCase().includes(query)
    );
  }, [merchants, search]);

  const runAction = async (task: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await task();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !disableUserId) return;
    await runAction(async () => {
      await api.adminDisableUser(token, disableUserId, false);
      setMessage("User disabled.");
    });
  };

  const handleImpersonate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !impersonateMerchantId) return;
    await runAction(async () => {
      const response = await api.adminImpersonate(token, { merchantId: impersonateMerchantId });
      setMessage(`Impersonation token issued for ${response.user.identifier}.`);
    });
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
      <PageHeader title="Platform Admin" subtitle="Merchant activation, trial control, plan support, and platform oversight for Novoriq Stock Plattform." />
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
        <Card title="Merchant Search" subtitle="Pick a merchant, then activate, deactivate, extend the trial, or set a plan manually.">
          <Input label="Search merchants" onChange={(event) => setSearch(event.target.value)} placeholder="Business name, slug, or id" value={search} />
          <Select label="Selected Merchant" onChange={(event) => setSelectedMerchantId(event.target.value)} value={selectedMerchantId}>
            <option value="">Choose merchant</option>
            {visibleMerchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
          </Select>
          {selectedMerchant ? (
            <div className="summary-grid">
              <p>
                <span className="summary-label">Status</span>
                <strong>{selectedMerchant.isActive === false ? "Deactivated" : "Active"}</strong>
              </p>
              <p>
                <span className="summary-label">Plan</span>
                <strong>{selectedMerchant.subscriptions?.[0]?.plan?.name ?? "Starter"}</strong>
              </p>
              <p>
                <span className="summary-label">Period End</span>
                <strong>{selectedMerchant.subscriptions?.[0]?.billingPeriodEnd ? formatDateTime(selectedMerchant.subscriptions[0].billingPeriodEnd) : "-"}</strong>
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="Activation + Plan" subtitle="Use this after an EcoCash proof arrives on WhatsApp.">
          <Select label="Plan" onChange={(event) => setPlanCode(event.target.value as (typeof planOptions)[number])} value={planCode}>
            {planOptions.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </Select>
          <Input label="Duration Days" onChange={(event) => setDurationDays(event.target.value)} value={durationDays} />
          <Input label="Payment Reference" onChange={(event) => setPaymentReference(event.target.value)} placeholder="EcoCash reference or proof id" value={paymentReference} />
          <TextArea label="Notes" onChange={(event) => setNotes(event.target.value)} placeholder="Support notes or WhatsApp proof context" value={notes} />
          <div className="inline-actions">
            <Button
              disabled={!token || !selectedMerchantId || busy}
              onClick={() =>
                void runAction(async () => {
                  if (!token || !selectedMerchantId) return;
                  await api.adminSetPlan(token, {
                    merchantId: selectedMerchantId,
                    planCode,
                    durationDays: Number(durationDays || 30),
                    status: "ACTIVE",
                    paymentReference,
                    notes
                  });
                  await api.adminSetMerchantStatus(token, {
                    merchantId: selectedMerchantId,
                    isActive: true,
                    paymentReference,
                    notes
                  });
                  setMessage("Merchant activated and plan updated.");
                })
              }
              variant="primary"
            >
              Activate Merchant
            </Button>
            <Button
              disabled={!token || !selectedMerchantId || busy}
              onClick={() =>
                void runAction(async () => {
                  if (!token || !selectedMerchantId) return;
                  await api.adminSetPlan(token, {
                    merchantId: selectedMerchantId,
                    planCode,
                    durationDays: Number(durationDays || 30),
                    status: "ACTIVE",
                    paymentReference,
                    notes
                  });
                  setMessage("Plan updated.");
                })
              }
              variant="secondary"
            >
              Set Plan
            </Button>
            <Button
              disabled={!token || !selectedMerchantId || busy}
              onClick={() =>
                void runAction(async () => {
                  if (!token || !selectedMerchantId) return;
                  await api.adminSetMerchantStatus(token, {
                    merchantId: selectedMerchantId,
                    isActive: false,
                    paymentReference,
                    notes
                  });
                  setMessage("Merchant deactivated.");
                })
              }
              variant="danger"
            >
              Deactivate
            </Button>
          </div>
          <div className="inline-actions">
            <Input label="Trial Days" onChange={(event) => setTrialDays(event.target.value)} value={trialDays} />
            <Button
              disabled={!token || !selectedMerchantId || busy}
              onClick={() =>
                void runAction(async () => {
                  if (!token || !selectedMerchantId) return;
                  await api.adminExtendTrial(token, { merchantId: selectedMerchantId, days: Number(trialDays || 7) });
                  await api.adminSetMerchantStatus(token, { merchantId: selectedMerchantId, isActive: true, notes });
                  setMessage("Trial extended.");
                })
              }
              variant="secondary"
            >
              Extend Trial
            </Button>
          </div>
        </Card>
      </div>

      <div className="split-grid">
        <Card title="Support Actions" subtitle="Operational tools for staff support">
          <form className="form-stack" onSubmit={handleDisable}>
            <Input label="Disable user id" value={disableUserId} onChange={(event) => setDisableUserId(event.target.value)} />
            <Button disabled={busy} type="submit" variant="secondary">
              Disable User
            </Button>
          </form>
          <form className="form-stack" onSubmit={handleImpersonate}>
            <Input
              label="Impersonate merchant id"
              value={impersonateMerchantId}
              onChange={(event) => setImpersonateMerchantId(event.target.value)}
            />
            <Button disabled={busy} type="submit" variant="primary">
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

      <Card title="Merchants" subtitle="Current status, plan, and latest usage for support and billing workflows">
        <div className="card-stack">
          {visibleMerchants.map((merchant) => (
            <ListCard
              key={merchant.id}
              actions={
                <div className="inline-actions">
                  <Button onClick={() => setSelectedMerchantId(merchant.id)} size="sm" variant="secondary">
                    Manage
                  </Button>
                </div>
              }
              badge={
                <span className={`status-badge ${merchant.isActive === false ? "status-cancelled" : "status-paid"}`}>
                  {merchant.isActive === false ? "Inactive" : "Active"}
                </span>
              }
              fields={[
                { label: "Plan", value: merchant.subscriptions?.[0]?.plan?.name ?? "Starter" },
                { label: "Status", value: merchant.subscriptions?.[0]?.status ?? "TRIALING" },
                {
                  label: "Period End",
                  value: merchant.subscriptions?.[0]?.billingPeriodEnd ? formatDateTime(merchant.subscriptions[0].billingPeriodEnd) : "-"
                },
                { label: "Last usage update", value: merchant.usageCounters?.[0] ? formatDateTime(merchant.usageCounters[0].updatedAt) : "No usage yet" }
              ]}
              subtitle={merchant.slug || merchant.id}
              title={merchant.name}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}
