import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { toPlain } from "../../lib/serialization";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get(
  "/movements",
  requirePermission("inventory.read"),
  asyncHandler(async (req, res) => {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const movements = await prisma.stockMovement.findMany({
      where: {
        merchantId: req.user!.merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null
      },
      include: { product: true, order: true },
      orderBy: { createdAt: "desc" },
      take: 300
    });

    res.json({ movements: toPlain(movements) });
  })
);

inventoryRouter.get(
  "/low-stock",
  requirePermission("inventory.read"),
  asyncHandler(async (req, res) => {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    if (branchId) {
      const stocks = await prisma.productStock.findMany({
        where: {
          merchantId: req.user!.merchantId,
          branchId,
          deletedAt: null
        },
        include: { product: true }
      });

      const low = stocks.filter((item) => Number(item.qty) <= Number(item.lowStockThreshold));
      res.json({ products: toPlain(low), lowStockCount: low.length });
      return;
    }

    const products = await prisma.product.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    const low = products.filter((item) => Number(item.stockQty) <= Number(item.lowStockThreshold));
    res.json({ products: toPlain(low), lowStockCount: low.length });
  })
);
