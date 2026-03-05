import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { toPlain } from "../../lib/serialization";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const movements = await prisma.stockMovement.findMany({
      where: {
        merchantId: req.user!.merchantId,
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
  asyncHandler(async (req, res) => {
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
