import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getButtonClassName, Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDateTime, formatMoney } from "../lib/format";
import type { ReceiptData } from "../types";

function paynowTone(status?: string | null): string {
  if (!status) return "status-draft";
  if (status === "PAID") return "status-paid";
  if (status === "AWAITING") return "status-sent";
  if (status === "FAILED") return "status-cancelled";
  if (status === "CANCELLED") return "status-cancelled";
  return "status-draft";
}

export function ReceiptPage() {
  const { token } = useAuth();
  const { id = "" } = useParams();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (!token || !id) return;
    setError("");
    try {
      const result = await api.getReceipt(token, id);
      setReceipt(result.receipt);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load receipt");
    }
  };

  useEffect(() => {
    void load();
  }, [token, id]);

  return (
    <section className="page-stack receipt-page">
      <PageHeader
        action={
          <Link className={getButtonClassName("ghost")} to={`/orders/${id}`}>
            Back to Order
          </Link>
        }
        subtitle="Printable customer receipt"
        title="Receipt"
      />

      {error ? <p className="status-text error">{error}</p> : null}

      {!receipt ? (
        <Card>
          <p className="subtle-text">Loading receipt...</p>
        </Card>
      ) : (
        <>
          <Card className="receipt-card" title={receipt.businessName}>
            <div className="receipt-meta-grid">
              <p>
                <span>Receipt #</span>
                <strong>{receipt.receiptNumber}</strong>
              </p>
              <p>
                <span>Order #</span>
                <strong>{receipt.orderNumber}</strong>
              </p>
              <p>
                <span>Date</span>
                <strong>{formatDateTime(receipt.dateTime)}</strong>
              </p>
              <p>
                <span>Customer</span>
                <strong>{receipt.customerName}</strong>
              </p>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.unitPrice, receipt.currencySymbol)}</td>
                      <td>{formatMoney(item.lineTotal, receipt.currencySymbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="receipt-total-grid">
              <p>
                <span>Subtotal</span>
                <strong>{formatMoney(receipt.totals.subtotal, receipt.currencySymbol)}</strong>
              </p>
              <p>
                <span>Discount</span>
                <strong>{formatMoney(receipt.totals.discountAmount, receipt.currencySymbol)}</strong>
              </p>
              <p>
                <span>Total</span>
                <strong>{formatMoney(receipt.totals.total, receipt.currencySymbol)}</strong>
              </p>
              <p>
                <span>Paid</span>
                <strong>{formatMoney(receipt.totals.paid, receipt.currencySymbol)}</strong>
              </p>
              <p>
                <span>Balance</span>
                <strong>{formatMoney(receipt.totals.balance, receipt.currencySymbol)}</strong>
              </p>
            </div>

            <div className="receipt-paynow-row">
              <span>Paynow Status</span>
              <span className={`status-badge ${paynowTone(receipt.paynowStatus)}`}>{receipt.paynowStatus || "N/A"}</span>
            </div>

            <div className="receipt-qr-placeholder">QR: {receipt.qrPayload}</div>
          </Card>

          <Card subtitle="Payments captured for this order" title="Payment History">
            {receipt.payments.length === 0 ? (
              <EmptyState description="No payments were recorded yet." title="No payments" />
            ) : (
              <ul className="metric-list">
                {receipt.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>
                      {payment.method} {payment.reference ? `(${payment.reference})` : ""}
                    </span>
                    <strong>{formatMoney(payment.amount, receipt.currencySymbol)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="actions-row">
            <Button onClick={() => window.print()} variant="primary">
              Download PDF (Print)
            </Button>
            <Button onClick={() => window.print()} variant="secondary">
              Print Receipt
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
