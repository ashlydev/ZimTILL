import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatDateTime, formatMoney } from "../lib/format";
import type { Order, Payment } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Table, type TableColumn } from "../components/ui/Table";

const methods = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER"];

const paymentColumns: Array<TableColumn<Payment>> = [
  {
    key: "time",
    header: "Time",
    render: (payment) => formatDateTime(payment.paidAt)
  },
  {
    key: "order",
    header: "Order",
    render: (payment) => payment.orderId.slice(0, 8)
  },
  {
    key: "method",
    header: "Method",
    render: (payment) => payment.method
  },
  {
    key: "amount",
    header: "Amount",
    render: (payment) => formatMoney(Number(payment.amount))
  },
  {
    key: "reference",
    header: "Reference",
    render: (payment) => payment.reference || "-"
  }
];

export function PaymentsPage() {
  const { token } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const [paymentsRes, ordersRes] = await Promise.all([
        loadWithCache("payments", () => api.listPayments(token)),
        loadWithCache("orders:payments", () => api.listOrders(token))
      ]);

      setPayments(paymentsRes.value.payments);
      setOrders(ordersRes.value.orders.filter((order) => order.status !== "CANCELLED"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load payments");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const totalCollected = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount), 0), [payments]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setBusy(true);
    setError("");

    try {
      await api.createPayment(token, {
        orderId,
        amount: Number(amount),
        method,
        reference: reference.trim() || undefined,
        paidAt: new Date().toISOString()
      });
      setOrderId("");
      setAmount("");
      setReference("");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button form="payment-form" type="submit" variant="primary">
            Record Payment
          </Button>
        }
        subtitle="Capture and track payment activity across all active orders."
        title="Payments"
      />

      <div className="stats-grid">
        <StatCard helper={`${payments.length} transactions`} label="Total Collected" value={formatMoney(totalCollected)} />
        <Card className="stat-helper-card">
          <div className="actions-row">
            <Button onClick={() => void refresh()} variant="secondary">
              Refresh Data
            </Button>
          </div>
        </Card>
      </div>

      <Card subtitle="Select an open order and record the payment details" title="Payment Entry">
        <form className="form-stack" id="payment-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <Select label="Order" onChange={(event) => setOrderId(event.target.value)} required value={orderId}>
              <option value="">Select order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} ({order.status}) - {formatMoney(Number(order.total))}
                </option>
              ))}
            </Select>

            <Input label="Amount" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} />

            <Select label="Method" onChange={(event) => setMethod(event.target.value)} value={method}>
              {methods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>

            <Input label="Reference" onChange={(event) => setReference(event.target.value)} value={reference} />
          </div>
        </form>
      </Card>

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Latest payments first" title="Payment List">
        {payments.length === 0 ? (
          <EmptyState description="Record a payment above to populate this list." title="No payments yet" />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={paymentColumns} rowKey={(payment) => payment.id} rows={payments} />
            </div>

            <div className="mobile-only card-stack">
              {payments.map((payment) => (
                <ListCard
                  key={payment.id}
                  fields={[
                    { label: "Order", value: payment.orderId.slice(0, 8) },
                    { label: "Method", value: payment.method },
                    { label: "Amount", value: formatMoney(Number(payment.amount)) },
                    { label: "Reference", value: payment.reference || "-" },
                    { label: "Paid At", value: formatDateTime(payment.paidAt) }
                  ]}
                  subtitle="Payment"
                  title={payment.method}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
