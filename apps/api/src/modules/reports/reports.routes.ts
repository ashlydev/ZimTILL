import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { toPlain } from "../../lib/serialization";

const OPEN_ORDER_STATUSES = new Set(["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID"]);
const SOLD_ORDER_STATUSES = new Set(["CONFIRMED", "PARTIALLY_PAID", "PAID"]);

type LoadedReportInput = Awaited<ReturnType<typeof loadReportInput>>;

type ReportTopProduct = {
  productId: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  qtySold: number;
  revenue: number;
  profit: number | null;
};

type ReportTopCategory = {
  categoryId: string | null;
  name: string;
  qtySold: number;
  revenue: number;
  profit: number | null;
};

type ReportDay = {
  date: string;
  paymentsTotal: number;
  ordersCount: number;
  outstandingTotal: number;
  returnsQty: number;
  expiredQty: number;
  damagedQty: number;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  const value = startOfDay(date);
  value.setDate(value.getDate() + 1);
  value.setMilliseconds(value.getMilliseconds() - 1);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function parseReason(reason: string | null | undefined): "RETURN" | "EXPIRED" | "DAMAGED" | null {
  if (!reason) return null;
  if (reason.startsWith("RETURN")) return "RETURN";
  if (reason.startsWith("EXPIRED")) return "EXPIRED";
  if (reason.startsWith("DAMAGED")) return "DAMAGED";
  return null;
}

function parseDays(value: unknown): 7 | 30 {
  return String(value) === "30" ? 30 : 7;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildReportWindow(query: Record<string, unknown>) {
  const days = parseDays(query.days);
  const requestedTo = parseDate(query.to) ?? new Date();
  const requestedFrom = parseDate(query.from);
  const to = endOfDay(requestedTo);
  const from = requestedFrom ? startOfDay(requestedFrom) : startOfDay(addDays(to, -(days - 1)));
  return { days, from, to };
}

async function loadReportInput(
  merchantId: string,
  branchId: string | undefined,
  from: Date,
  to: Date
) {
  const [categories, products, orders, payments, movements, expenses] = await Promise.all([
    prisma.category.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.product.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: [{ name: "asc" }]
    }),
    prisma.order.findMany({
      where: {
        merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        createdAt: { lte: to }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.payment.findMany({
      where: {
        merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        status: "CONFIRMED",
        paidAt: { lte: to }
      },
      orderBy: { paidAt: "asc" }
    }),
    prisma.stockMovement.findMany({
      where: {
        merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        createdAt: { gte: from, lte: to }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.expense.findMany({
      where: {
        merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        spentAt: { gte: from, lte: to }
      },
      orderBy: { spentAt: "asc" }
    })
  ]);

  const rangedOrderIds = orders
    .filter((order) => order.createdAt >= from && order.createdAt <= to)
    .map((order) => order.id);

  const orderItems = rangedOrderIds.length
    ? await prisma.orderItem.findMany({
        where: {
          merchantId,
          deletedAt: null,
          orderId: { in: rangedOrderIds }
        },
        orderBy: { createdAt: "asc" }
      })
    : [];

  return {
    from,
    to,
    categories,
    products,
    orders,
    payments,
    orderItems,
    movements,
    expenses
  };
}

function buildReport(input: LoadedReportInput) {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const productById = new Map(
    input.products.map((product) => [
      product.id,
      {
        ...product,
        categoryName: product.categoryId ? categoryById.get(product.categoryId)?.name ?? product.category ?? null : product.category ?? null
      }
    ])
  );
  const paymentsByOrderId = new Map<string, number>();
  for (const payment of input.payments) {
    paymentsByOrderId.set(payment.orderId, (paymentsByOrderId.get(payment.orderId) ?? 0) + toNumber(payment.amount));
  }

  const daily: ReportDay[] = [];
  for (let cursor = startOfDay(input.from); cursor <= input.to; cursor = addDays(cursor, 1)) {
    const dayKey = formatDateKey(cursor);
    const dayStart = startOfDay(cursor);
    const dayEnd = endOfDay(cursor);

    const paymentsTotal = input.payments
      .filter((payment) => payment.paidAt >= dayStart && payment.paidAt <= dayEnd)
      .reduce((sum, payment) => sum + toNumber(payment.amount), 0);

    const ordersCount = input.orders.filter((order) => order.createdAt >= dayStart && order.createdAt <= dayEnd).length;

    const outstandingTotal = input.orders.reduce((sum, order) => {
      if (order.createdAt > dayEnd || order.status === "CANCELLED") {
        return sum;
      }

      const paid = input.payments
        .filter((payment) => payment.orderId === order.id && payment.paidAt <= dayEnd)
        .reduce((running, payment) => running + toNumber(payment.amount), 0);

      const balance = Math.max(toNumber(order.total) - paid, 0);
      if (!OPEN_ORDER_STATUSES.has(order.status) && balance <= 0) {
        return sum;
      }

      return sum + balance;
    }, 0);

    const movementSummary = input.movements.reduce(
      (summary, movement) => {
        if (formatDateKey(movement.createdAt) !== dayKey) {
          return summary;
        }

        const reason = parseReason(movement.reason);
        if (!reason) return summary;
        const quantity = Math.abs(toNumber(movement.quantity));

        if (reason === "RETURN") summary.returnsQty += quantity;
        if (reason === "EXPIRED") summary.expiredQty += quantity;
        if (reason === "DAMAGED") summary.damagedQty += quantity;
        return summary;
      },
      { returnsQty: 0, expiredQty: 0, damagedQty: 0 }
    );

    daily.push({
      date: dayKey,
      paymentsTotal,
      ordersCount,
      outstandingTotal,
      returnsQty: movementSummary.returnsQty,
      expiredQty: movementSummary.expiredQty,
      damagedQty: movementSummary.damagedQty
    });
  }

  const topProductsMap = new Map<string, ReportTopProduct>();
  for (const item of input.orderItems) {
    const order = input.orders.find((candidate) => candidate.id === item.orderId);
    if (!order || !SOLD_ORDER_STATUSES.has(order.status) || order.status === "CANCELLED") {
      continue;
    }

    const product = productById.get(item.productId);
    const current = topProductsMap.get(item.productId) ?? {
      productId: item.productId,
      name: product?.name ?? "Unavailable product",
      categoryId: product?.categoryId ?? null,
      categoryName: product?.categoryName ?? null,
      qtySold: 0,
      revenue: 0,
      profit: product?.cost == null ? null : 0
    };

    const quantity = toNumber(item.quantity);
    const revenue = toNumber(item.lineTotal);
    current.qtySold += quantity;
    current.revenue += revenue;
    if (current.profit != null && product?.cost != null) {
      current.profit += revenue - toNumber(product.cost) * quantity;
    }
    topProductsMap.set(item.productId, current);
  }

  const topProducts = [...topProductsMap.values()].sort((left, right) => {
    if (right.revenue !== left.revenue) return right.revenue - left.revenue;
    return right.qtySold - left.qtySold;
  }).slice(0, 10);

  const topCategoriesMap = new Map<string, ReportTopCategory>();
  for (const item of topProductsMap.values()) {
    const key = item.categoryId ?? `name:${item.categoryName ?? "uncategorized"}`;
    const current = topCategoriesMap.get(key) ?? {
      categoryId: item.categoryId,
      name: item.categoryName ?? "Uncategorized",
      qtySold: 0,
      revenue: 0,
      profit: item.profit == null ? null : 0
    };
    current.qtySold += item.qtySold;
    current.revenue += item.revenue;
    if (current.profit != null && item.profit != null) {
      current.profit += item.profit;
    }
    topCategoriesMap.set(key, current);
  }

  const topCategories = [...topCategoriesMap.values()].sort((left, right) => {
    if (right.revenue !== left.revenue) return right.revenue - left.revenue;
    return right.qtySold - left.qtySold;
  }).slice(0, 10);

  const returnsExpired = input.movements.reduce(
    (summary, movement) => {
      const reason = parseReason(movement.reason);
      if (!reason) return summary;
      const product = productById.get(movement.productId);
      const quantity = Math.abs(toNumber(movement.quantity));
      const value = quantity * toNumber(product?.price ?? 0);

      if (reason === "RETURN") {
        summary.returnsCount += quantity;
        summary.returnsValue += value;
      }
      if (reason === "EXPIRED") {
        summary.expiredCount += quantity;
        summary.expiredValue += value;
      }
      if (reason === "DAMAGED") {
        summary.damagedCount += quantity;
        summary.damagedValue += value;
      }
      return summary;
    },
    {
      returnsCount: 0,
      returnsValue: 0,
      expiredCount: 0,
      expiredValue: 0,
      damagedCount: 0,
      damagedValue: 0
    }
  );

  const lowStock = input.products
    .filter((product) => toNumber(product.stockQty) <= toNumber(product.lowStockThreshold))
    .map((product) => ({
      productId: product.id,
      name: product.name,
      categoryId: product.categoryId ?? null,
      categoryName: product.categoryId ? categoryById.get(product.categoryId)?.name ?? product.category ?? null : product.category ?? null,
      stockQty: toNumber(product.stockQty),
      lowStockThreshold: toNumber(product.lowStockThreshold)
    }))
    .sort((left, right) => left.stockQty - right.stockQty || left.name.localeCompare(right.name));

  const todayStart = startOfDay(new Date());
  const last7Start = startOfDay(addDays(todayStart, -6));
  const last30Start = startOfDay(addDays(todayStart, -29));

  const buildWindowSummary = (windowStart: Date) => {
    const payments = input.payments
      .filter((payment) => payment.paidAt >= windowStart)
      .reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    const ordersCount = input.orders.filter((order) => order.createdAt >= windowStart).length;
    const outstandingTotal = input.orders.reduce((sum, order) => {
      if (order.createdAt < windowStart || order.status === "CANCELLED") {
        return sum;
      }
      const paid = paymentsByOrderId.get(order.id) ?? 0;
      const balance = Math.max(toNumber(order.total) - paid, 0);
      return sum + balance;
    }, 0);

    const windowOrderIds = new Set(
      input.orders.filter((order) => order.createdAt >= windowStart && SOLD_ORDER_STATUSES.has(order.status)).map((order) => order.id)
    );
    const productWindowMap = new Map<string, { productId: string; name: string; categoryId: string | null; categoryName: string | null; qty: number; revenue: number; profit: number | null }>();
    const categoryWindowMap = new Map<string, { categoryId: string | null; name: string; qty: number; revenue: number; profit: number | null }>();

    for (const item of input.orderItems) {
      if (!windowOrderIds.has(item.orderId)) continue;
      const product = productById.get(item.productId);
      const productEntry = productWindowMap.get(item.productId) ?? {
        productId: item.productId,
        name: product?.name ?? "Unavailable product",
        categoryId: product?.categoryId ?? null,
        categoryName: product?.categoryName ?? null,
        qty: 0,
        revenue: 0,
        profit: product?.cost == null ? null : 0
      };
      const quantity = toNumber(item.quantity);
      const revenue = toNumber(item.lineTotal);
      productEntry.qty += quantity;
      productEntry.revenue += revenue;
      if (productEntry.profit != null && product?.cost != null) {
        productEntry.profit += revenue - toNumber(product.cost) * quantity;
      }
      productWindowMap.set(item.productId, productEntry);

      const categoryKey = product?.categoryId ?? `name:${product?.categoryName ?? "uncategorized"}`;
      const categoryEntry = categoryWindowMap.get(categoryKey) ?? {
        categoryId: product?.categoryId ?? null,
        name: product?.categoryName ?? "Uncategorized",
        qty: 0,
        revenue: 0,
        profit: product?.cost == null ? null : 0
      };
      categoryEntry.qty += quantity;
      categoryEntry.revenue += revenue;
      if (categoryEntry.profit != null && product?.cost != null) {
        categoryEntry.profit += revenue - toNumber(product.cost) * quantity;
      }
      categoryWindowMap.set(categoryKey, categoryEntry);
    }

    return {
      salesTotal: payments,
      ordersCount,
      outstandingTotal,
      topProducts: [...productWindowMap.values()].sort((left, right) => right.revenue - left.revenue || right.qty - left.qty).slice(0, 10),
      topCategories: [...categoryWindowMap.values()].sort((left, right) => right.revenue - left.revenue || right.qty - left.qty).slice(0, 10)
    };
  };

  return {
    salesBasis: "PAYMENTS_RECEIVED" as const,
    ordersCountBasis: "ORDERS_CREATED" as const,
    generatedAt: new Date().toISOString(),
    today: buildWindowSummary(todayStart),
    last7Days: buildWindowSummary(last7Start),
    last30Days: buildWindowSummary(last30Start),
    daily,
    topProducts,
    topCategories,
    lowStock,
    returnsExpired
  };
}

function buildProfitSummary(input: LoadedReportInput) {
  const soldOrders = input.orders.filter((order) => SOLD_ORDER_STATUSES.has(order.status) && order.status !== "CANCELLED");
  const soldOrderIds = new Set(soldOrders.map((order) => order.id));
  const productsById = new Map(input.products.map((product) => [product.id, product]));

  let revenue = 0;
  let cogs = 0;
  let missingCostCount = 0;
  for (const item of input.orderItems) {
    if (!soldOrderIds.has(item.orderId)) continue;
    const product = productsById.get(item.productId);
    revenue += toNumber(item.lineTotal);
    if (product?.cost == null) {
      missingCostCount += 1;
      continue;
    }
    cogs += toNumber(product.cost) * toNumber(item.quantity);
  }

  const discountsGiven = soldOrders.reduce((sum, order) => sum + toNumber(order.discountAmount), 0);
  const report = buildReport(input);
  const returnsValue = report.returnsExpired.returnsValue;
  const damagedLosses = report.returnsExpired.damagedValue;
  const expiredLosses = report.returnsExpired.expiredValue;
  const grossProfit = revenue - cogs;
  const netStockLossImpact = damagedLosses + expiredLosses;
  const expensesTotal = input.expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const estimatedNetProfit = grossProfit - discountsGiven - returnsValue - netStockLossImpact - expensesTotal;

  return {
    revenue,
    cogs,
    grossProfit,
    discountsGiven,
    returnsValue,
    damagedLosses,
    expiredLosses,
    netStockLossImpact,
    expensesTotal,
    estimatedNetProfit,
    missingCostCount
  };
}

async function buildOwnerControl(
  merchantId: string,
  branchId: string | undefined,
  input: LoadedReportInput
) {
  const [users, cashUps, recentAudits] = await Promise.all([
    prisma.user.findMany({
      where: { merchantId, deletedAt: null, isActive: true },
      select: { id: true, identifier: true, role: true }
    }),
    prisma.cashUpSession.findMany({
      where: {
        merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        openedAt: { gte: input.from, lte: input.to }
      },
      include: {
        user: { select: { id: true, identifier: true, role: true } },
        branch: { select: { id: true, name: true } }
      },
      orderBy: { openedAt: "desc" }
    }),
    prisma.auditLog.findMany({
      where: {
        merchantId,
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: input.from, lte: input.to },
        action: { in: ["order.cancel", "order.update", "stocktake.finalize", "cashup.submit"] }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const branchIds = [...new Set(input.orders.map((order) => order.branchId).filter(Boolean))] as string[];
  const branches = branchIds.length
    ? await prisma.branch.findMany({ where: { id: { in: branchIds }, merchantId, deletedAt: null }, select: { id: true, name: true } })
    : [];
  const branchById = new Map(branches.map((branch) => [branch.id, branch.name]));

  const paymentsByOrderId = new Map<string, number>();
  for (const payment of input.payments) {
    paymentsByOrderId.set(payment.orderId, (paymentsByOrderId.get(payment.orderId) ?? 0) + toNumber(payment.amount));
  }

  const salesByCashierMap = new Map<string, { userId: string; identifier: string; ordersCount: number; salesTotal: number; paidTotal: number }>();
  for (const order of input.orders) {
    const userId = order.createdByUserId ?? "unknown";
    const key = userId;
    const actor = userById.get(userId);
    const current = salesByCashierMap.get(key) ?? {
      userId,
      identifier: actor?.identifier ?? "Unknown cashier",
      ordersCount: 0,
      salesTotal: 0,
      paidTotal: 0
    };
    current.ordersCount += 1;
    current.salesTotal += toNumber(order.total);
    current.paidTotal += paymentsByOrderId.get(order.id) ?? 0;
    salesByCashierMap.set(key, current);
  }

  const salesByBranchMap = new Map<string, { branchId: string | null; name: string; ordersCount: number; salesTotal: number; paidTotal: number }>();
  for (const order of input.orders) {
    const key = order.branchId ?? "unassigned";
    const current = salesByBranchMap.get(key) ?? {
      branchId: order.branchId ?? null,
      name: order.branchId ? branchById.get(order.branchId) ?? "Unknown branch" : "No branch",
      ordersCount: 0,
      salesTotal: 0,
      paidTotal: 0
    };
    current.ordersCount += 1;
    current.salesTotal += toNumber(order.total);
    current.paidTotal += paymentsByOrderId.get(order.id) ?? 0;
    salesByBranchMap.set(key, current);
  }

  const recentLosses = input.movements
    .filter((movement) => parseReason(movement.reason) != null)
    .slice(-12)
    .reverse()
    .map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      productId: movement.productId,
      reason: parseReason(movement.reason),
      quantity: Math.abs(toNumber(movement.quantity))
    }));

  const suspiciousActivity = [
    ...input.orders
      .filter((order) => order.status === "CANCELLED" || toNumber(order.discountAmount) > 0)
      .slice(-12)
      .map((order) => ({
        id: order.id,
        createdAt: order.updatedAt,
        title: order.status === "CANCELLED" ? "Sale voided" : "Discount applied",
        detail:
          order.status === "CANCELLED"
            ? `${order.orderNumber} was voided by ${userById.get(order.updatedByUserId ?? order.createdByUserId ?? "")?.identifier ?? "staff"}`
            : `${order.orderNumber} had ${toNumber(order.discountAmount).toFixed(2)} discount`
      })),
    ...recentAudits.map((audit) => ({
      id: audit.id,
      createdAt: audit.createdAt,
      title: audit.action,
      detail: audit.entityType
    }))
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 12);

  const expectedCash = cashUps.reduce((sum, item) => sum + toNumber(item.expectedCash), 0);
  const countedCash = cashUps.reduce((sum, item) => sum + toNumber(item.countedCash), 0);
  const cashVariance = cashUps.reduce((sum, item) => sum + toNumber(item.variance), 0);

  return {
    salesByCashier: [...salesByCashierMap.values()].sort((left, right) => right.salesTotal - left.salesTotal),
    salesByBranch: [...salesByBranchMap.values()].sort((left, right) => right.salesTotal - left.salesTotal),
    expensesTotal: input.expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0),
    expectedCash,
    countedCash,
    cashVariance,
    cashUps: cashUps.map((item) => ({
      id: item.id,
      status: item.status,
      openingFloat: toNumber(item.openingFloat),
      expectedCash: toNumber(item.expectedCash),
      countedCash: toNumber(item.countedCash),
      variance: toNumber(item.variance),
      openedAt: item.openedAt,
      submittedAt: item.submittedAt,
      user: item.user,
      branch: item.branch
    })),
    lowStock: buildReport(input).lowStock.slice(0, 10),
    topProducts: buildReport(input).last7Days.topProducts.slice(0, 6),
    recentExpenses: input.expenses
      .slice(-6)
      .reverse()
      .map((expense) => ({
        id: expense.id,
        title: expense.title,
        category: expense.category,
        amount: toNumber(expense.amount),
        spentAt: expense.spentAt
      })),
    recentLosses,
    suspiciousActivity
  };
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get(
  "/summary",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const thirtyDays = buildReportWindow({ ...req.query, days: req.query.days ?? "30" });
    const input = await loadReportInput(merchantId, branchId, thirtyDays.from, thirtyDays.to);
    res.json(toPlain(buildReport(input)));
  })
);

reportsRouter.get(
  "/daily",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const window = buildReportWindow(req.query as Record<string, unknown>);
    const input = await loadReportInput(merchantId, branchId, window.from, window.to);
    res.json(toPlain(buildReport(input).daily));
  })
);

reportsRouter.get(
  "/top-products",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const window = buildReportWindow(req.query as Record<string, unknown>);
    const input = await loadReportInput(merchantId, branchId, window.from, window.to);
    res.json(toPlain(buildReport(input).topProducts));
  })
);

reportsRouter.get(
  "/top-categories",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const window = buildReportWindow(req.query as Record<string, unknown>);
    const input = await loadReportInput(merchantId, branchId, window.from, window.to);
    res.json(toPlain(buildReport(input).topCategories));
  })
);

reportsRouter.get(
  "/profit",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const window = buildReportWindow(req.query as Record<string, unknown>);
    const input = await loadReportInput(merchantId, branchId, window.from, window.to);
    res.json(toPlain(buildProfitSummary(input)));
  })
);

reportsRouter.get(
  "/owner-control",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const window = buildReportWindow({ ...req.query, days: req.query.days ?? "30" });
    const input = await loadReportInput(merchantId, branchId, window.from, window.to);
    res.json(toPlain(await buildOwnerControl(merchantId, branchId, input)));
  })
);
