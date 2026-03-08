import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatMoney } from "../lib/format";
import type { ReportsSummary } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Table, type TableColumn } from "../components/ui/Table";

type ReportPeriod = "today" | "last7Days";

type TopProduct = ReportsSummary["last7Days"]["topProducts"][number];

const topProductColumns: Array<TableColumn<TopProduct>> = [
  {
    key: "name",
    header: "Product",
    render: (item) => item.name
  },
  {
    key: "qty",
    header: "Qty Sold",
    render: (item) => item.qty
  }
];

export function ReportsPage() {
  const { token, activeBranchId } = useAuth();
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("last7Days");
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const result = await loadWithCache(`reports:summary:${activeBranchId ?? "all"}`, () => api.getReports(token, activeBranchId));
      setReport(result.value);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, activeBranchId]);

  const active = useMemo(() => {
    if (!report) return null;
    if (period === "today") {
      return {
        salesTotal: Number(report.today.salesTotal),
        ordersCount: report.today.ordersCount,
        topProducts: report.last7Days.topProducts
      };
    }

    return {
      salesTotal: Number(report.last7Days.salesTotal),
      ordersCount: report.last7Days.ordersCount,
      topProducts: report.last7Days.topProducts
    };
  }, [report, period]);

  const averageOrderValue = useMemo(() => {
    if (!active || active.ordersCount === 0) return 0;
    return active.salesTotal / active.ordersCount;
  }, [active]);

  const topUnits = active?.topProducts.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button onClick={() => void refresh()} variant="secondary">
            Refresh
          </Button>
        }
        subtitle="Sales performance and top-selling products for your hardware shop."
        title="Reports"
      />

      {error ? <p className="status-text error">{error}</p> : null}

      {!report || !active ? (
        <Card>
          <p className="subtle-text">Loading reports...</p>
        </Card>
      ) : (
        <>
          <Card title="Time Filter">
            <div className="report-filter-row">
              <Select label="Period" onChange={(event) => setPeriod(event.target.value as ReportPeriod)} value={period}>
                <option value="today">Today</option>
                <option value="last7Days">Last 7 Days</option>
              </Select>
            </div>
          </Card>

          <div className="stats-grid">
            <StatCard label="Sales Total" value={formatMoney(active.salesTotal)} />
            <StatCard label="Orders Count" value={active.ordersCount} />
            <StatCard label="Average Order" value={formatMoney(averageOrderValue)} />
            <StatCard label="Top Product Units" value={topUnits} />
          </div>

          {report.returnsExpired ? (
            <Card subtitle="Last 7 days from offline-ready stock movements" title="Returns / Expired Summary">
              <div className="summary-inline">
                <p>
                  <span>Returns</span>
                  <strong>{report.returnsExpired.returnsCount}</strong>
                </p>
                <p>
                  <span>Expired</span>
                  <strong>{report.returnsExpired.expiredCount}</strong>
                </p>
                <p>
                  <span>Damaged</span>
                  <strong>{report.returnsExpired.damagedCount}</strong>
                </p>
              </div>
            </Card>
          ) : null}

          <Card subtitle={period === "today" ? "Top sellers in the recent sales window" : "Top sellers over the last 7 days"} title="Top Products">
            {active.topProducts.length === 0 ? (
              <EmptyState description="No product movement for the selected period." title="No top products yet" />
            ) : (
              <>
                <div className="desktop-only">
                  <Table columns={topProductColumns} rowKey={(item) => item.productId} rows={active.topProducts} />
                </div>
                <div className="mobile-only card-stack">
                  {active.topProducts.map((item) => (
                    <ListCard
                      key={item.productId}
                      fields={[{ label: "Qty Sold", value: item.qty }]}
                      subtitle="Top Product"
                      title={item.name}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
