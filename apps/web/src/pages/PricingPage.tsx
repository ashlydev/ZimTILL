import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Plan, Subscription, UsageCounter } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/FormControls";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";

const SUPPORT_PHONE = "0782576106";

export function PricingPage() {
  const { token, subscription } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<UsageCounter[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(subscription);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const trialDaysRemaining =
    currentSubscription?.status === "TRIALING" && currentSubscription.billingPeriodEnd
      ? Math.max(0, Math.ceil((new Date(currentSubscription.billingPeriodEnd).getTime() - Date.now()) / 86_400_000))
      : 0;
  const isExpired =
    !!currentSubscription &&
    currentSubscription.status !== "ACTIVE" &&
    new Date(currentSubscription.billingPeriodEnd).getTime() < Date.now();

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      const [plansRes, subscriptionRes] = await Promise.all([api.listPlans(), api.getSubscriptionSnapshot(token)]);
      setPlans(plansRes.plans);
      setUsage(subscriptionRes.usageCounters);
      setCurrentSubscription(subscriptionRes.subscription ?? null);
    };

    void load();
  }, [token, subscription]);

  const requestUpgrade = async (event: FormEvent<HTMLFormElement>, requestedPlanCode: "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE") => {
    event.preventDefault();
    if (!token) return;
    try {
      await api.requestUpgrade(token, { requestedPlanCode, notes });
      setMessage(`Upgrade request sent for ${requestedPlanCode}.`);
      setNotes("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upgrade request failed");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader title="Pricing" subtitle="Every merchant starts with a 7-day free trial. After that, activate manually after EcoCash payment confirmation." />
      {message ? <p className="status-text">{message}</p> : null}

      {currentSubscription?.status === "TRIALING" ? (
        <Card title="Free Trial" subtitle="Starter limits apply during the trial window.">
          <p className={isExpired ? "status-text error" : "status-text warning"}>
            {isExpired ? "Trial expired. Activate your account to continue creating or editing records." : `${trialDaysRemaining} day(s) left in the free trial.`}
          </p>
        </Card>
      ) : null}

      <Card title="Manual Activation" subtitle="Customer pays EcoCash, sends proof on WhatsApp, then a platform admin activates the merchant.">
        <div className="metric-list">
          <div className="metric-list-row">
            <span>EcoCash number</span>
            <strong>{SUPPORT_PHONE}</strong>
          </div>
          <div className="metric-list-row">
            <span>Reference</span>
            <strong>Business name + phone</strong>
          </div>
          <div className="metric-list-row">
            <span>WhatsApp proof</span>
            <strong>Send payment screenshot to support</strong>
          </div>
        </div>
      </Card>

      <div className="stats-grid">
        <StatCard label="Current Plan" value={currentSubscription?.plan?.name ?? "Starter"} />
        <StatCard label="Status" value={currentSubscription?.status ?? "TRIALING"} />
        <StatCard label="Period Start" value={currentSubscription?.billingPeriodStart?.slice(0, 10) ?? "-"} />
        <StatCard label="Period End" value={currentSubscription?.billingPeriodEnd?.slice(0, 10) ?? "-"} />
      </div>

      <Card title="Current Usage" subtitle="Billing-period counters and hard-count limits">
        <div className="metric-list">
          {usage.map((counter) => (
            <div key={counter.id} className="metric-list-row">
              <span>{counter.key}</span>
              <strong>{counter.count}</strong>
            </div>
          ))}
        </div>
      </Card>

      <div className="pricing-grid">
        {plans.map((plan) => (
          <Card key={plan.id} title={`${plan.name} - $${Number(plan.priceMonthly).toFixed(0)}/mo`} subtitle={plan.code}>
            <ul className="metric-list">
              {Object.entries(plan.limits).map(([key, value]) => (
                <li key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </li>
              ))}
            </ul>
            <form className="form-stack" onSubmit={(event) => void requestUpgrade(event, plan.code as "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE")}>
              <Input label="Upgrade note" value={notes} onChange={(event) => setNotes(event.target.value)} />
              <Button type="submit" variant={currentSubscription?.plan?.code === plan.code ? "secondary" : "primary"}>
                {currentSubscription?.plan?.code === plan.code ? "Current Plan" : "Request Upgrade"}
              </Button>
            </form>
          </Card>
        ))}
      </div>
    </section>
  );
}
