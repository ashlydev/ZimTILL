import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatDateTime, formatMoney, formatOrderStatus, toStatusClass } from "../lib/format";
import type { Order, ReportsSummary } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Table, type TableColumn } from "../components/ui/Table";

type DashboardData = {
  report: ReportsSummary;
  orders: Order[];
  lowStockCount: number;
};

function emptyReport(): ReportsSummary {
  return {
    salesBasis: "PAYMENTS_RECEIVED",
    ordersCountBasis: "ORDERS_CREATED",
    generatedAt: new Date().toISOString(),
    today: {
      salesTotal: 0,
      ordersCount: 0,
      outstandingTotal: 0
    },
    last7Days: {
      salesTotal: 0,
      ordersCount: 0,
      outstandingTotal: 0,
      topProducts: [],
      topCategories: []
    },
    last30Days: {
      salesTotal: 0,
      ordersCount: 0,
      outstandingTotal: 0,
      topProducts: [],
      topCategories: []
    },
    daily: [],
    topProducts: [],
    topCategories: [],
    lowStock: [],
    returnsExpired: {
      returnsCount: 0,
      returnsValue: 0,
      expiredCount: 0,
      expiredValue: 0,
      damagedCount: 0,
      damagedValue: 0
    }
  };
}

const recentOrderColumns: Array<TableColumn<Order>> = [
  {
    key: "order",
    header: "Order",
    render: (order) => <Link to={`/orders/${order.id}`}>{order.orderNumber}</Link>
  },
  {
    key: "customer",
    header: "Customer",
    render: (order) => order.customer?.name || "Walk-in"
  },
  {
    key: "status",
    header: "Status",
    render: (order) => <span className={`status-badge ${toStatusClass(order.status)}`}>{formatOrderStatus(order.status)}</span>
  },
  {
    key: "total",
    header: "Total",
    render: (order) => formatMoney(Number(order.total))
  },
  {
    key: "updated",
    header: "Updated",
    render: (order) => formatDateTime(order.updatedAt)
  }
];

export function DashboardPage() {
  const { token, activeBranchId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | undefined>();
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const cacheKey = `dashboard:${activeBranchId ?? "all"}`;
      const result = await loadWithCache(cacheKey, async () => {
        const [reportResult, ordersResult, lowStockResult] = await Promise.allSettled([
          api.getReports(token, activeBranchId),
          api.listOrders(token, "", activeBranchId),
          api.getLowStock(token, activeBranchId)
        ]);

        const report = reportResult.status === "fulfilled" ? reportResult.value : emptyReport();
        const orders = ordersResult.status === "fulfilled" ? ordersResult.value.orders : [];
        const lowStockCount = lowStockResult.status === "fulfilled" ? lowStockResult.value.lowStockCount : 0;

        if (reportResult.status === "rejected" && ordersResult.status === "rejected" && lowStockResult.status === "rejected") {
          throw reportResult.reason;
        }

        return {
          report,
          orders,
          lowStockCount
        };
      });

      setData(result.value);
      setCachedAt(result.cachedAt);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, activeBranchId]);

  const outstanding = useMemo(() => {
    if (!data) return 0;
    return data.orders
      .filter((order) => ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID"].includes(order.status))
      .reduce((sum, order) => sum + Number(order.total), 0);
  }, [data]);

  const recentOrders = useMemo(() => {
    if (!data) return [];
    return [...data.orders].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8);
  }, [data]);

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button onClick={() => void refresh()} variant="secondary">
            Refresh
          </Button>
        }
        subtitle="Daily performance, outstanding balances, and order activity at a glance."
        title="Dashboard"
      />

      {cachedAt ? <p className="subtle-text">Cached snapshot: {new Date(cachedAt).toLocaleString()}</p> : null}
      {error ? <p className="status-text error">{error}</p> : null}

      {data ? (
        <div className="stats-grid">
          <StatCard label="Today Sales" value={formatMoney(Number(data.report.today.salesTotal))} />
          <StatCard label="Today Orders" value={data.report.today.ordersCount} />
          <StatCard label="Outstanding" value={formatMoney(outstanding)} />
          <StatCard label="Low Stock Items" value={data.lowStockCount} />
        </div>
      ) : (
        <Card>
          <p className="subtle-text">Loading dashboard...</p>
        </Card>
      )}

      <Card subtitle="Most recently updated orders" title="Recent Orders">
        {recentOrders.length === 0 ? (
          <EmptyState description="Create your first order to start tracking sales in the dashboard." title="No recent orders" />
        ) : (
          <>
            <div className="desktop-only">
              <Table columns={recentOrderColumns} rowKey={(order) => order.id} rows={recentOrders} />
            </div>
            <div className="mobile-only card-stack">
              {recentOrders.map((order) => (
                <ListCard
                  key={order.id}
                  actions={
                    <Link className="text-link" to={`/orders/${order.id}`}>
                      View order
                    </Link>
                  }
                  badge={<span className={`status-badge ${toStatusClass(order.status)}`}>{formatOrderStatus(order.status)}</span>}
                  fields={[
                    { label: "Customer", value: order.customer?.name || "Walk-in" },
                    { label: "Total", value: formatMoney(Number(order.total)) },
                    { label: "Updated", value: formatDateTime(order.updatedAt) }
                  ]}
                  title={order.orderNumber}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {data ? (
        <Card subtitle="Top selling lines by quantity" title="Top Products (Last 7 Days)">
          {data.report.last7Days.topProducts.length === 0 ? (
            <EmptyState description="Top products will appear once sales are recorded." title="No product movement" />
          ) : (
            <ul className="metric-list">
              {data.report.last7Days.topProducts.map((item) => (
                <li key={item.productId}>
                  <span>{item.name}</span>
                  <strong>{item.qty} sold</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </section>
  );
}
