import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatDateTime } from "../lib/format";
import type { Product, StockMovement } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
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

export function InventoryPage() {
  const { token } = useAuth();
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const [lowStockRes, movementsRes] = await Promise.all([
        loadWithCache("inventory:low-stock", () => api.getLowStock(token)),
        loadWithCache("inventory:movements", () => api.listMovements(token))
      ]);
      setLowStock(lowStockRes.value.products);
      setMovements(movementsRes.value.movements);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load inventory");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button onClick={() => void refresh()} variant="secondary">
            Refresh
          </Button>
        }
        subtitle="Monitor low stock alerts and movement history."
        title="Inventory"
      />

      {error ? <p className="status-text error">{error}</p> : null}

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
