import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatDateTime } from "../lib/format";
import type { Order, Product, StockMovement } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select, TextArea } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

const lowStockColumns: Array<TableColumn<Product>> = [
  {
    key: "product",
    header: "Product",
    render: (product) => product.name
  },
  {
    key: "stock",
    header: "Stock Left",
    render: (product) => product.stockQty
  },
  {
    key: "threshold",
    header: "Threshold",
    render: (product) => product.lowStockThreshold
  }
];

const movementColumns: Array<TableColumn<StockMovement>> = [
  {
    key: "time",
    header: "Time",
    render: (movement) => formatDateTime(movement.createdAt)
  },
  {
    key: "product",
    header: "Product",
    render: (movement) => movement.product?.name || movement.productId.slice(0, 8)
  },
  {
    key: "type",
    header: "Type",
    render: (movement) => movement.type
  },
  {
    key: "qty",
    header: "Qty",
    render: (movement) => movement.quantity
  },
  {
    key: "reason",
    header: "Reason",
    render: (movement) => movement.reason || "-"
  }
];

const initialAdjustmentForm = {
  productId: "",
  orderId: "",
  quantity: "1",
  occurredAt: new Date().toISOString().slice(0, 16),
  notes: ""
};

export function InventoryPage() {
  const { token } = useAuth();
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustmentForm, setAdjustmentForm] = useState(initialAdjustmentForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const [lowStockRes, movementsRes, ordersRes, productsRes] = await Promise.all([
        loadWithCache("inventory:low-stock", () => api.getLowStock(token)),
        loadWithCache("inventory:movements", () => api.listMovements(token)),
        loadWithCache("inventory:orders", () => api.listOrders(token)),
        loadWithCache("inventory:products", () => api.listProducts(token))
      ]);
      setLowStock(lowStockRes.value.products);
      setMovements(movementsRes.value.movements);
      setOrders(ordersRes.value.orders);
      setProducts(productsRes.value.products);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load inventory");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const submitAdjustment = async (event: FormEvent, reason: "RETURN" | "EXPIRED" | "DAMAGED") => {
    event.preventDefault();
    if (!token) return;

    setBusy(true);
    setError("");
    try {
      await api.recordInventoryAdjustment(token, {
        productId: adjustmentForm.productId,
        orderId: adjustmentForm.orderId || null,
        quantity: Number(adjustmentForm.quantity || 0),
        reason,
        notes: adjustmentForm.notes.trim() || undefined,
        occurredAt: adjustmentForm.occurredAt ? new Date(adjustmentForm.occurredAt).toISOString() : undefined
      });
      setAdjustmentForm(initialAdjustmentForm);
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to record inventory adjustment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button onClick={() => void refresh()} variant="secondary">
            Refresh
          </Button>
        }
        subtitle="Monitor low stock alerts, movement history, and offline returns or write-offs."
        title="Inventory"
      />

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Returns add stock back. Expired and damaged items reduce stock." title="Returns & Expired Goods">
        <form className="form-stack">
          <div className="form-grid">
            <Select
              label="Product"
              onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, productId: event.target.value }))}
              required
              value={adjustmentForm.productId}
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>

            <Input
              label="Quantity"
              min={1}
              onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, quantity: event.target.value }))}
              required
              type="number"
              value={adjustmentForm.quantity}
            />

            <Select label="Related Order (optional)" onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, orderId: event.target.value }))} value={adjustmentForm.orderId}>
              <option value="">No linked order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber}
                </option>
              ))}
            </Select>

            <Input
              label="Date"
              onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
              type="datetime-local"
              value={adjustmentForm.occurredAt}
            />

            <TextArea
              containerClassName="span-2"
              label="Notes"
              onChange={(event) => setAdjustmentForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={3}
              value={adjustmentForm.notes}
            />
          </div>

          <div className="actions-row wrap">
            <Button disabled={busy || !adjustmentForm.productId} onClick={(event) => void submitAdjustment(event, "RETURN")} variant="primary">
              Return Items
            </Button>
            <Button disabled={busy || !adjustmentForm.productId} onClick={(event) => void submitAdjustment(event, "EXPIRED")} variant="secondary">
              Mark Expired
            </Button>
            <Button disabled={busy || !adjustmentForm.productId} onClick={(event) => void submitAdjustment(event, "DAMAGED")} variant="danger">
              Mark Damaged
            </Button>
          </div>
        </form>
      </Card>

      <Card subtitle="Products at or below threshold" title="Low Stock Alerts">
        {lowStock.length === 0 ? (
          <EmptyState description="All tracked products are currently above their low stock threshold." title="No low stock alerts" />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={lowStockColumns} rowKey={(product) => product.id} rows={lowStock} />
            </div>
            <div className="mobile-only card-stack">
              {lowStock.map((product) => (
                <ListCard
                  key={product.id}
                  fields={[
                    { label: "Stock Left", value: product.stockQty },
                    { label: "Threshold", value: product.lowStockThreshold }
                  ]}
                  subtitle="Low Stock"
                  title={product.name}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      <Card subtitle="Chronological movement history" title="Stock Movements">
        {movements.length === 0 ? (
          <EmptyState description="Stock changes will appear here after sales or manual adjustments." title="No stock movements yet" />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={movementColumns} rowKey={(movement) => movement.id} rows={movements} />
            </div>
            <div className="mobile-only card-stack">
              {movements.map((movement) => (
                <ListCard
                  key={movement.id}
                  fields={[
                    { label: "Product", value: movement.product?.name || movement.productId.slice(0, 8) },
                    { label: "Type", value: movement.type },
                    { label: "Qty", value: movement.quantity },
                    { label: "Reason", value: movement.reason || "-" },
                    { label: "Time", value: formatDateTime(movement.createdAt) }
                  ]}
                  subtitle="Movement"
                  title={movement.type}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
