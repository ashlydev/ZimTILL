import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import { formatMoney } from "../lib/format";
import type { Category, ReportDay, ReportsSummary } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Table, type TableColumn } from "../components/ui/Table";

type ReportPeriod = "last7Days" | "last30Days";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = String(cell ?? "");
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildCsvRows(period: ReportPeriod, report: ReportsSummary) {
  const active = report[period];
  const rows: string[][] = [["Section", "Name", "Category", "Qty", "Revenue", "Date", "Orders", "Outstanding", "Returns", "Expired", "Damaged"]];

  for (const row of report.daily.slice(period === "last7Days" ? -7 : -30)) {
    rows.push([
      "Daily",
      "",
      "",
      "",
      String(row.paymentsTotal),
      row.date,
      String(row.ordersCount),
      String(row.outstandingTotal),
      String(row.returnsQty),
      String(row.expiredQty),
      String(row.damagedQty)
    ]);
  }

  for (const item of active.topProducts) {
    rows.push(["Top Product", item.name, item.categoryName ?? "Uncategorized", String(item.qty), String(item.revenue), "", "", "", "", "", ""]);
  }

  for (const item of active.topCategories) {
    rows.push(["Top Category", item.name, item.name, String(item.qty), String(item.revenue), "", "", "", "", "", ""]);
  }

  for (const item of report.lowStock) {
    rows.push(["Low Stock", item.name, item.categoryName ?? "Uncategorized", String(item.stockQty), String(item.lowStockThreshold), "", "", "", "", "", ""]);
  }

  return rows;
}

const dailyColumns: Array<TableColumn<ReportDay>> = [
  { key: "date", header: "Date", render: (row) => row.date },
  { key: "paymentsTotal", header: "Payments", render: (row) => formatMoney(row.paymentsTotal) },
  { key: "ordersCount", header: "Orders", render: (row) => row.ordersCount },
  { key: "outstandingTotal", header: "Outstanding", render: (row) => formatMoney(row.outstandingTotal) },
  { key: "returnsQty", header: "Returns", render: (row) => row.returnsQty },
  { key: "expiredQty", header: "Expired", render: (row) => row.expiredQty },
  { key: "damagedQty", header: "Damaged", render: (row) => row.damagedQty }
];

export function ReportsPage() {
  const { token, activeBranchId, isOnline } = useAuth();
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>("last30Days");
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const [reportResult, categoriesResult] = await Promise.all([
        loadWithCache(`reports:summary:${activeBranchId ?? "all"}`, () => api.getReports(token, activeBranchId)),
        api.listCategories(token)
      ]);
      setReport(reportResult.value);
      setCategories(categoriesResult.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, activeBranchId]);

  const active = report?.[period] ?? null;
  const dailyRows = useMemo(() => report?.daily.slice(period === "last7Days" ? -7 : -30) ?? [], [period, report]);

  const filteredTopProducts = useMemo(() => {
    if (!active) return [];
    return active.topProducts.filter((item) => {
      const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
      const matchesSearch = !search.trim() || `${item.name} ${item.categoryName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [active, search, selectedCategoryId]);

  const filteredTopCategories = useMemo(() => {
    if (!active) return [];
    return active.topCategories.filter((item) => {
      const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
      const matchesSearch = !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [active, search, selectedCategoryId]);

  const filteredLowStock = useMemo(() => {
    if (!report) return [];
    return report.lowStock.filter((item) => {
      const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
      const matchesSearch = !search.trim() || `${item.name} ${item.categoryName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [report, search, selectedCategoryId]);

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <div className="inline-actions">
            <Button onClick={() => report && downloadCsv(`novoriq-stock-reports-${period}.csv`, buildCsvRows(period, report))} variant="ghost">
              Export CSV
            </Button>
            <Button onClick={() => void refresh()} variant="secondary">
              Refresh
            </Button>
          </div>
        }
        subtitle="Sales are based on payments received. Reports stay visible offline and refresh again when internet returns."
        title="Reports"
      />

      {!isOnline ? <p className="status-text warning">Offline mode: showing cached local report data. Connect to refresh merchant-wide sales.</p> : null}
      {error ? <p className="status-text error">{error}</p> : null}

      {!report || !active ? (
        <Card>
          <p className="subtle-text">Loading reports...</p>
        </Card>
      ) : (
        <>
          <Card title="Report Filters" subtitle="Choose a window, then narrow product and category sections without leaving the page.">
            <div className="filters-row">
              <div className="filters-left">
                <Select label="Period" onChange={(event) => setPeriod(event.target.value as ReportPeriod)} value={period}>
                  <option value="last7Days">Last 7 days</option>
                  <option value="last30Days">Last 30 days</option>
                </Select>
                <Input label="Search" onChange={(event) => setSearch(event.target.value)} placeholder="Search product or category" value={search} />
                <Select label="Category Filter" onChange={(event) => setSelectedCategoryId(event.target.value)} value={selectedCategoryId}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          <div className="stats-grid">
            <StatCard label="Sales" value={formatMoney(active.salesTotal)} />
            <StatCard label="Orders" value={active.ordersCount} />
            <StatCard label="Outstanding" value={formatMoney(active.outstandingTotal)} />
            <StatCard label="Generated" value={new Date(report.generatedAt).toLocaleString()} />
          </div>

          <div className="stats-grid">
            <StatCard label="Returned Qty" value={report.returnsExpired.returnsCount} />
            <StatCard label="Expired Qty" value={report.returnsExpired.expiredCount} />
            <StatCard label="Damaged Qty" value={report.returnsExpired.damagedCount} />
            <StatCard label="Losses Value" value={formatMoney(report.returnsExpired.expiredValue + report.returnsExpired.damagedValue)} />
          </div>

          <Card title="Daily Sales" subtitle={`Payments received by day for the ${period === "last7Days" ? "last 7 days" : "last 30 days"}.`}>
            <div className="desktop-only">
              <Table columns={dailyColumns} rowKey={(row) => row.date} rows={dailyRows} />
            </div>
            <div className="mobile-only card-stack">
              {dailyRows.map((row) => (
                <ListCard
                  key={row.date}
                  fields={[
                    { label: "Payments", value: formatMoney(row.paymentsTotal) },
                    { label: "Orders", value: row.ordersCount },
                    { label: "Outstanding", value: formatMoney(row.outstandingTotal) },
                    { label: "Returns", value: row.returnsQty },
                    { label: "Expired", value: row.expiredQty },
                    { label: "Damaged", value: row.damagedQty }
                  ]}
                  subtitle="Daily sales"
                  title={row.date}
                />
              ))}
            </div>
          </Card>

          <Card title="Top Products" subtitle="Top 10 products by revenue for the selected period.">
            {filteredTopProducts.length === 0 ? (
              <EmptyState description="No matching sales rows for the current filters." title="No product sales found" />
            ) : (
              <div className="card-stack">
                {filteredTopProducts.map((item) => (
                  <ListCard
                    key={item.productId}
                    fields={[
                      { label: "Category", value: item.categoryName ?? "Uncategorized" },
                      { label: "Qty", value: item.qty },
                      { label: "Revenue", value: formatMoney(item.revenue) }
                    ]}
                    subtitle="Top product"
                    title={item.name}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Top Categories" subtitle="Category performance for the selected period.">
            {filteredTopCategories.length === 0 ? (
              <EmptyState description="No matching category totals for the current filters." title="No category sales found" />
            ) : (
              <div className="card-stack">
                {filteredTopCategories.map((item) => (
                  <ListCard
                    key={`${item.categoryId ?? item.name}`}
                    fields={[
                      { label: "Qty", value: item.qty },
                      { label: "Revenue", value: formatMoney(item.revenue) }
                    ]}
                    subtitle="Top category"
                    title={item.name}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Low Stock" subtitle="Products at or below their low-stock threshold.">
            {filteredLowStock.length === 0 ? (
              <EmptyState description="No low-stock products for the current filter." title="Stock levels look healthy" />
            ) : (
              <div className="card-stack">
                {filteredLowStock.map((item) => (
                  <ListCard
                    key={item.productId}
                    fields={[
                      { label: "Category", value: item.categoryName ?? "Uncategorized" },
                      { label: "Stock", value: item.stockQty },
                      { label: "Threshold", value: item.lowStockThreshold }
                    ]}
                    subtitle="Low stock"
                    title={item.name}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
