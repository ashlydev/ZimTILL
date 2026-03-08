import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { onlinePaymentsMessage } from "../lib/offlineCore";
import { formatDateTime, formatMoney, formatOrderStatus, toStatusClass } from "../lib/format";
import type { Order, Payment, Product } from "../types";
import { getButtonClassName, Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

type OrderDetails = Order & {
  items: Array<{ id: string; quantity: number; unitPrice: number; lineTotal: number; product: Product }>;
  payments: Payment[];
};

const paymentMethods = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER"];
const paynowMethods: Array<"ecocash" | "onemoney" | "web" | "card" | "other"> = ["ecocash", "onemoney", "web", "card", "other"];

const itemColumns: Array<TableColumn<OrderDetails["items"][number]>> = [
  {
    key: "product",
    header: "Product",
    render: (item) => item.product.name
  },
  {
    key: "qty",
    header: "Qty",
    render: (item) => item.quantity
  },
  {
    key: "unit",
    header: "Unit",
    render: (item) => formatMoney(Number(item.unitPrice))
  },
  {
    key: "lineTotal",
    header: "Line Total",
    render: (item) => formatMoney(Number(item.lineTotal))
  }
];

const paymentColumns: Array<TableColumn<Payment>> = [
  {
    key: "paidAt",
    header: "Paid At",
    render: (payment) => formatDateTime(payment.paidAt)
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

function paynowBadgeClass(status: string): string {
  if (status === "PAID") return "status-paid";
  if (status === "AWAITING") return "status-sent";
  if (status === "FAILED" || status === "CANCELLED") return "status-cancelled";
  return "status-draft";
}

export function OrderDetailsPage() {
  const { id = "" } = useParams();
  const { token, isOnline } = useAuth();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [paid, setPaid] = useState(0);
  const [balance, setBalance] = useState(0);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [paynowAmount, setPaynowAmount] = useState("");
  const [paynowMethod, setPaynowMethod] = useState<"ecocash" | "onemoney" | "web" | "card" | "other">("ecocash");
  const [paynowPhone, setPaynowPhone] = useState("");
  const [paynowTransactionId, setPaynowTransactionId] = useState("");
  const [paynowStatus, setPaynowStatus] = useState<string>("");
  const [paynowMessage, setPaynowMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!token || !id) return;
    setError("");
    try {
      const result = await api.getOrder(token, id);
      if (!result) {
        setOrder(null);
        setPaid(0);
        setBalance(0);
        setError("Order not found");
        return;
      }
      setOrder(result.order);
      setPaid(Number(result.summary.paid));
      setBalance(Number(result.summary.balance));
      if (!paynowAmount) {
        setPaynowAmount(String(Number(result.summary.balance || 0).toFixed(2)));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load order");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, id]);

  const whatsappLink = useMemo(() => {
    if (!order) return "";
    const plain = `${order.orderNumber} - Total ${formatMoney(Number(order.total))}`;
    return `https://wa.me/?text=${encodeURIComponent(plain)}`;
  }, [order]);

  const runAction = async (action: "confirm" | "cancel") => {
    if (!token || !id) return;
    setBusy(true);
    setError("");
    try {
      if (action === "confirm") {
        await api.confirmOrder(token, id);
      } else {
        await api.cancelOrder(token, id);
      }
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onAddPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !order) return;

    setBusy(true);
    setError("");

    try {
      await api.createPayment(token, {
        orderId: order.id,
        amount: Number(payAmount),
        method: payMethod,
        reference: payReference || undefined,
        paidAt: new Date().toISOString()
      });

      setPayAmount("");
      setPayReference("");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add payment");
    } finally {
      setBusy(false);
    }
  };

  const onShareWhatsApp = async () => {
    if (!token || !id) return;
    try {
      const result = await api.getOrderShareText(token, id);
      const url = `https://wa.me/?text=${encodeURIComponent(result.message)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(whatsappLink, "_blank", "noopener,noreferrer");
    }
  };

  const onInitiatePaynow = async () => {
    if (!token || !order) return;
    setBusy(true);
    setError("");

    try {
      const result = await api.initiatePaynow(token, {
        orderId: order.id,
        amount: Number(paynowAmount || 0),
        method: paynowMethod,
        phone: paynowPhone || undefined
      });

      setPaynowTransactionId(result.transactionId);
      setPaynowStatus("AWAITING");
      setPaynowMessage(result.instructions);

      if (result.redirectUrl) {
        window.open(result.redirectUrl, "_blank", "noopener,noreferrer");
      }
    } catch (paynowError) {
      setError(paynowError instanceof Error ? paynowError.message : "Failed to initiate Paynow payment");
    } finally {
      setBusy(false);
    }
  };

  const onCheckPaynowStatus = async () => {
    if (!token || !paynowTransactionId) return;
    setBusy(true);
    setError("");

    try {
      const result = await api.checkPaynowStatus(token, paynowTransactionId);
      setPaynowStatus(result.status);
      setPaynowMessage(result.message);
      if (result.status === "PAID") {
        await refresh();
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to check Paynow status");
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <section className="page-stack">
        <PageHeader
          action={
            <Link className={getButtonClassName("ghost")} to="/orders">
              Back to Orders
            </Link>
          }
          subtitle="Loading selected order details."
          title="Order Details"
        />
        {error ? <p className="status-text error">{error}</p> : null}
        <Card>
          <p className="subtle-text">Loading order...</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <div className="actions-row wrap">
            <Link className={getButtonClassName("secondary")} to={`/orders/${id}/receipt`}>
              View Receipt
            </Link>
            <Link className={getButtonClassName("ghost")} to="/orders">
              Back to Orders
            </Link>
          </div>
        }
        subtitle={`Created ${formatDateTime(order.createdAt)}`}
        title={`Order ${order.orderNumber}`}
      />

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Current customer and payment status" title="Summary">
        <div className="summary-grid">
          <div>
            <p className="summary-label">Status</p>
            <p>
              <span className={`status-badge ${toStatusClass(order.status)}`}>{formatOrderStatus(order.status)}</span>
            </p>
          </div>
          <div>
            <p className="summary-label">Customer</p>
            <p>{order.customer?.name || "Walk-in"}</p>
          </div>
          <div>
            <p className="summary-label">Order Total</p>
            <p>{formatMoney(Number(order.total))}</p>
          </div>
          <div>
            <p className="summary-label">Paid</p>
            <p>{formatMoney(paid)}</p>
          </div>
          <div>
            <p className="summary-label">Balance</p>
            <p>{formatMoney(balance)}</p>
          </div>
          <div>
            <p className="summary-label">Last Updated</p>
            <p>{formatDateTime(order.updatedAt)}</p>
          </div>
        </div>
      </Card>

      <Card title="Action Bar">
        <div className="actions-row wrap">
          <Button disabled={busy} onClick={() => void runAction("confirm")} variant="secondary">
            Mark Confirmed
          </Button>
          <Button disabled={busy} onClick={() => void runAction("cancel")} variant="danger">
            Cancel Order
          </Button>
          <Button onClick={() => void onShareWhatsApp()} variant="primary">
            Share to WhatsApp
          </Button>
        </div>
      </Card>

      <Card subtitle="Paynow checkout with clear status tracking" title="Pay with Paynow">
        {!isOnline ? <p className="status-text warning">{onlinePaymentsMessage()}</p> : null}
        <div className="form-grid">
          <Input
            label="Amount"
            onChange={(event) => setPaynowAmount(event.target.value)}
            step="0.01"
            type="number"
            value={paynowAmount}
          />
          <Select label="Method" onChange={(event) => setPaynowMethod(event.target.value as typeof paynowMethod)} value={paynowMethod}>
            {paynowMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
          {paynowMethod === "ecocash" || paynowMethod === "onemoney" ? (
            <Input label="Mobile Number" onChange={(event) => setPaynowPhone(event.target.value)} placeholder="+263..." value={paynowPhone} />
          ) : null}
        </div>

        <div className="actions-row wrap">
          <Button disabled={busy || !isOnline} onClick={() => void onInitiatePaynow()} variant="primary">
            Initiate Paynow
          </Button>
          <Button disabled={busy || !paynowTransactionId || !isOnline} onClick={() => void onCheckPaynowStatus()} variant="secondary">
            Check Status
          </Button>
        </div>

        {paynowTransactionId ? <p className="subtle-text">Transaction: {paynowTransactionId}</p> : null}
        {paynowStatus ? <span className={`status-badge ${paynowBadgeClass(paynowStatus)}`}>{paynowStatus}</span> : null}
        {paynowMessage ? <p className="subtle-text">{paynowMessage}</p> : null}
      </Card>

      <Card subtitle="Ordered products and line totals" title="Items">
        {order.items.length === 0 ? (
          <EmptyState description="No order items were found for this order." title="No items" />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={itemColumns} rowKey={(item) => item.id} rows={order.items} />
            </div>
            <div className="mobile-only card-stack">
              {order.items.map((item) => (
                <ListCard
                  key={item.id}
                  fields={[
                    { label: "Qty", value: item.quantity },
                    { label: "Unit", value: formatMoney(Number(item.unitPrice)) },
                    { label: "Line Total", value: formatMoney(Number(item.lineTotal)) }
                  ]}
                  subtitle="Item"
                  title={item.product.name}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      <Card subtitle="Capture customer settlements for this order" title="Add Payment">
        <form className="form-stack" onSubmit={onAddPayment}>
          <div className="form-grid">
            <Input
              label="Amount"
              onChange={(event) => setPayAmount(event.target.value)}
              required
              step="0.01"
              type="number"
              value={payAmount}
            />
            <Select label="Method" onChange={(event) => setPayMethod(event.target.value)} value={payMethod}>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
            <Input label="Reference" onChange={(event) => setPayReference(event.target.value)} value={payReference} />
          </div>
          <div className="actions-row">
            <Button disabled={busy} type="submit" variant="primary">
              Add Payment
            </Button>
          </div>
        </form>
      </Card>

      <Card subtitle="Latest payments first" title="Payment History">
        {order.payments.length === 0 ? (
          <EmptyState description="Record a payment above to update this order balance." title="No payments yet" />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={paymentColumns} rowKey={(payment) => payment.id} rows={order.payments} />
            </div>
            <div className="mobile-only card-stack">
              {order.payments.map((payment) => (
                <ListCard
                  key={payment.id}
                  fields={[
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
