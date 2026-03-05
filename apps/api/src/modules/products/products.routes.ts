import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().nullable().optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  stockQty: z.number(),
  lowStockThreshold: z.number().nonnegative()
});

const productUpdateSchema = productCreateSchema.partial();

const stockAdjustSchema = z.object({
  quantity: z.number(),
  reason: z.string().trim().max(120).optional()
});

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const lowStockOnly = req.query.lowStock === "true";

    const products = await prisma.product.findMany({
      where: {
        merchantId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: "desc" }
    });

    const filtered = lowStockOnly
      ? products.filter((item) => Number(item.stockQty) <= Number(item.lowStockThreshold))
      : products;

    res.json({ products: toPlain(filtered) });
  })
);

productsRouter.post(
  "/",
  validateBody(productCreateSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const deviceId = req.user!.deviceId;
    const now = new Date();
    const body = req.body as z.infer<typeof productCreateSchema>;

    const product = await prisma.product.create({
      data: {
        id: randomUUID(),
        merchantId,
        name: body.name,
        price: body.price,
        cost: body.cost ?? null,
        sku: body.sku ?? null,
        stockQty: body.stockQty,
        lowStockThreshold: body.lowStockThreshold,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: deviceId
      }
    });

    res.status(201).json({ product: toPlain(product) });
  })
);

productsRouter.put(
  "/:id",
  validateBody(productUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const product = await prisma.product.findFirst({
      where: { id, merchantId, deletedAt: null }
    });

    if (!product) {
      throw new HttpError(404, "Product not found");
    }

    const body = req.body as z.infer<typeof productUpdateSchema>;

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...body,
        updatedAt: new Date(),
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    res.json({ product: toPlain(updated) });
  })
);

productsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;

    const product = await prisma.product.findFirst({ where: { id, merchantId, deletedAt: null } });

    if (!product) {
      throw new HttpError(404, "Product not found");
    }

    const deleted = await prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    res.json({ product: toPlain(deleted) });
  })
);

productsRouter.post(
  "/:id/adjust-stock",
  validateBody(stockAdjustSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const product = await prisma.product.findFirst({
      where: { id, merchantId, deletedAt: null }
    });

    if (!product) {
      throw new HttpError(404, "Product not found");
    }

    const { quantity, reason } = req.body as z.infer<typeof stockAdjustSchema>;
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const nextQty = Number(product.stockQty) + quantity;

      const next = await tx.product.update({
        where: { id: product.id },
        data: {
          stockQty: nextQty,
          updatedAt: now,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          merchantId,
          productId: product.id,
          type: "ADJUSTMENT",
          quantity,
          reason: reason ?? "Manual adjustment",
          orderId: null,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      return next;
    });

    res.json({ product: toPlain(updated) });
  })
);
