import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { toPlain } from "../../lib/serialization";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get(
  "/summary",
  requirePermission("reports.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const now = new Date();
    const todayStart = startOfDay(now);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(todayStart.getDate() - 6);

    const [todayPayments, weekPayments, todayOrders, weekOrders, weekItems] = await Promise.all([
      prisma.payment.findMany({
        where: {
          merchantId,
          ...(branchId ? { branchId } : {}),
          deletedAt: null,
          status: "CONFIRMED",
          paidAt: { gte: todayStart }
        }
      }),
      prisma.payment.findMany({
        where: {
          merchantId,
          ...(branchId ? { branchId } : {}),
          deletedAt: null,
          status: "CONFIRMED",
          paidAt: { gte: sevenDaysAgo }
        }
      }),
      prisma.order.count({
        where: {
          merchantId,
          ...(branchId ? { branchId } : {}),
          deletedAt: null,
          createdAt: { gte: todayStart }
        }
      }),
      prisma.order.count({
        where: {
          merchantId,
          ...(branchId ? { branchId } : {}),
          deletedAt: null,
          createdAt: { gte: sevenDaysAgo }
        }
      }),
      prisma.orderItem.findMany({
        where: {
          merchantId,
          ...(branchId ? { branchId } : {}),
          deletedAt: null,
          createdAt: { gte: sevenDaysAgo }
        },
        include: { product: true }
      })
    ]);

    const todaySales = todayPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const weekSales = weekPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    const byProduct = new Map<string, { productId: string; name: string; qty: number }>();
    for (const item of weekItems) {
      const key = item.productId;
      const current = byProduct.get(key) ?? {
        productId: key,
        name: item.product.name,
        qty: 0
      };
      current.qty += Number(item.quantity);
      byProduct.set(key, current);
    }

    const topProducts = [...byProduct.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const isCashier = req.user?.role === "CASHIER";

    res.json(
      toPlain({
        salesBasis: "CONFIRMED_PAYMENTS",
        today: {
          salesTotal: todaySales,
          ordersCount: todayOrders
        },
        last7Days: {
          salesTotal: isCashier ? todaySales : weekSales,
          ordersCount: isCashier ? todayOrders : weekOrders,
          topProducts: isCashier ? topProducts.slice(0, 3) : topProducts
        }
      })
    );
  })
);
