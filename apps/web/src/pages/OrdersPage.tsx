import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatDateTime, formatMoney, formatOrderStatus, toStatusClass } from "../lib/format";
import type { Order, OrderStatus } from "../types";
import { getButtonClassName, Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

const statusFilters: Array<{ label: string; value: "ALL" | OrderStatus }> = [
  { label: "All Statuses", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Sent", value: "SENT" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Partially Paid", value: "PARTIALLY_PAID" },
  { label: "Paid", value: "PAID" },
  { label: "Cancelled", value: "CANCELLED" }
];

const orderColumns: Array<TableColumn<Order>> = [
  {
    key: "order",
    header: "Order",
    render: (order) => <Link to={`/orders/${order.id}`}>{order.orderNumber}</Link>
  },
  {
    key: "customer",
    header: "Customer",
    render: (order) => order.customer?.name || order.customerName || "Walk-in Customer"
  },
  {
    key: "status",
    header: "Status",
    render: (order) => <span className={`status-badge ${toStatusClass(order.status)}`}>{formatOrderStatus(order.status)}</span>
  },
  {
    key: "paid",
    header: "Paid",
    render: (order) => formatMoney(Number(order.paidTotal ?? 0))
  },
  {
    key: "total",
    header: "Total",
    render: (order) => formatMoney(Number(order.total))
  },
  {
    key: "balance",
    header: "Balance",
    render: (order) => formatMoney(Number(order.balance ?? Number(order.total)))
  },
  {
    key: "updated",
    header: "Updated",
    render: (order) => formatDateTime(order.updatedAt)
  }
];

export function OrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const result = await loadWithCache(`orders:${search}`, () => api.listOrders(token, search));
      setOrders(result.value.orders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, search]);

  const filteredOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (statusFilter === "ALL") return sorted;
    return sorted.filter((order) => order.status === statusFilter);
  }, [orders, statusFilter]);

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Link className={getButtonClassName("primary")} to="/orders/new">
            Create Order
          </Link>
        }
        subtitle="Track open and completed orders with quick filtering."
        title="Orders"
      />

      <Card>
        <div className="filters-row">
          <div className="filters-left">
            <Input label="Search" onChange={(event) => setSearch(event.target.value)} placeholder="Search by order number or customer" value={search} />
            <Select label="Status" onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrderStatus)} value={statusFilter}>
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="filters-right">
            <Button onClick={() => void refresh()} variant="secondary">
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Most recent updates first" title="Order List">
        {filteredOrders.length === 0 ? (
          <EmptyState
            action={
              <Link className={getButtonClassName("primary")} to="/orders/new">
                Create Order
              </Link>
            }
            description="No orders match the current search and status filters."
            title="No orders found"
          />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={orderColumns} rowKey={(order) => order.id} rows={filteredOrders} />
            </div>
            <div className="mobile-only card-stack">
              {filteredOrders.map((order) => (
                <ListCard
                  key={order.id}
                  actions={
                    <Link className="text-link" to={`/orders/${order.id}`}>
                      Open order
                    </Link>
                  }
                  badge={<span className={`status-badge ${toStatusClass(order.status)}`}>{formatOrderStatus(order.status)}</span>}
                  fields={[
                    { label: "Customer", value: order.customer?.name || order.customerName || "Walk-in Customer" },
                    { label: "Paid", value: formatMoney(Number(order.paidTotal ?? 0)) },
                    { label: "Total", value: formatMoney(Number(order.total)) },
                    { label: "Balance", value: formatMoney(Number(order.balance ?? Number(order.total))) },
                    { label: "Updated", value: formatDateTime(order.updatedAt) }
                  ]}
                  subtitle="Order"
                  title={order.orderNumber}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
