import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { recordAudit } from "../audit/audit.service";
import { assertPlanLimit } from "../platform/platform.service";

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().nullable().optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  stockQty: z.number(),
  lowStockThreshold: z.number().nonnegative()
});

const productUpdateSchema = productCreateSchema.partial();

const stockAdjustSchema = z.object({
  quantity: z.number(),
  reason: z.string().trim().max(120).optional()
});

async function resolveCategory(merchantId: string, categoryId: string | null | undefined) {
  if (!categoryId) {
    return null;
  }

  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      merchantId,
      deletedAt: null
    }
  });

  if (!category) {
    throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");
  }

  return category;
}

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  "/",
  requirePermission("products.read"),
  asyncHandler(async (req, res) => {
    await assertPlanLimit(prisma, req.user!.merchantId, "products");
    const merchantId = req.user!.merchantId;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const lowStockOnly = req.query.lowStock === "true";
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : "";

    const products = await prisma.product.findMany({
      where: {
        merchantId,
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: {
        categoryRef: true
      },
      orderBy: { updatedAt: "desc" }
    });

    const branchStocks = branchId
      ? await prisma.productStock.findMany({
          where: {
            merchantId,
            branchId,
            productId: { in: products.map((item) => item.id) },
            deletedAt: null
          }
        })
      : [];

    const stockByProduct = new Map(branchStocks.map((item) => [item.productId, item]));
    const mapped = products.map((item) => {
      const branchStock = stockByProduct.get(item.id);
      return {
        ...item,
        category: item.categoryRef?.name ?? item.category ?? null,
        branchStockQty: branchStock ? Number(branchStock.qty) : Number(item.stockQty),
        branchLowStockThreshold: branchStock ? Number(branchStock.lowStockThreshold) : Number(item.lowStockThreshold)
      };
    });

    const filtered = lowStockOnly
      ? mapped.filter((item) => Number(item.branchStockQty) <= Number(item.branchLowStockThreshold))
      : mapped;

    res.json({ products: toPlain(filtered) });
  })
);

productsRouter.post(
  "/",
  requirePermission("products.write"),
  validateBody(productCreateSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const deviceId = req.user!.deviceId;
    const branchId = req.user!.branchId;
    const now = new Date();
    const body = req.body as z.infer<typeof productCreateSchema>;
    const category = await resolveCategory(merchantId, body.categoryId ?? null);

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          id: randomUUID(),
          merchantId,
          categoryId: category?.id ?? null,
          createdByUserId: req.user!.userId,
          updatedByUserId: req.user!.userId,
          name: body.name,
          price: body.price,
          cost: body.cost ?? null,
          sku: body.sku ?? null,
          category: category?.name ?? null,
          stockQty: body.stockQty,
          lowStockThreshold: body.lowStockThreshold,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: deviceId
        }
      });

      if (branchId) {
        await tx.productStock.create({
          data: {
            id: randomUUID(),
            merchantId,
            branchId,
            productId: created.id,
            qty: body.stockQty,
            lowStockThreshold: body.lowStockThreshold,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: deviceId
          }
        });
      }

      return created;
    });

    await recordAudit(prisma, req.user!, {
      action: "product.create",
      entityType: "Product",
      entityId: product.id
    });

    res.status(201).json({ product: toPlain(product) });
  })
);

productsRouter.put(
  "/:id",
  requirePermission("products.write"),
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
    const category = Object.prototype.hasOwnProperty.call(body, "categoryId")
      ? await resolveCategory(merchantId, body.categoryId ?? null)
      : undefined;

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.cost !== undefined ? { cost: body.cost ?? null } : {}),
        ...(body.sku !== undefined ? { sku: body.sku ?? null } : {}),
        ...(body.stockQty !== undefined ? { stockQty: body.stockQty } : {}),
        ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
        ...(category !== undefined ? { categoryId: category?.id ?? null, category: category?.name ?? null } : {}),
        updatedAt: new Date(),
        updatedByUserId: req.user!.userId,
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      },
      include: {
        categoryRef: true
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "product.update",
      entityType: "Product",
      entityId: updated.id
    });

    res.json({
      product: toPlain({
        ...updated,
        category: updated.categoryRef?.name ?? updated.category ?? null
      })
    });
  })
);

productsRouter.delete(
  "/:id",
  requirePermission("products.write"),
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
        updatedByUserId: req.user!.userId,
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "product.delete",
      entityType: "Product",
      entityId: deleted.id
    });

    res.json({ product: toPlain(deleted) });
  })
);

productsRouter.post(
  "/:id/adjust-stock",
  requirePermission("inventory.write"),
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
    const branchId = req.user!.branchId;

    const updated = await prisma.$transaction(async (tx) => {
      const nextQty = Number(product.stockQty) + quantity;

      const next = await tx.product.update({
        where: { id: product.id },
        data: {
          stockQty: nextQty,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      if (branchId) {
        const branchStock = await tx.productStock.findFirst({
          where: { merchantId, branchId, productId: product.id, deletedAt: null }
        });

        if (branchStock) {
          await tx.productStock.update({
            where: { id: branchStock.id },
            data: {
              qty: Number(branchStock.qty) + quantity,
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });
        } else {
          await tx.productStock.create({
            data: {
              id: randomUUID(),
              merchantId,
              branchId,
              productId: product.id,
              qty: Number(product.stockQty) + quantity,
              lowStockThreshold: Number(product.lowStockThreshold),
              createdAt: now,
              updatedAt: now,
              version: 1,
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });
        }
      }

      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          merchantId,
          branchId: branchId ?? null,
          productId: product.id,
          createdByUserId: req.user!.userId,
          updatedByUserId: req.user!.userId,
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

    await recordAudit(prisma, req.user!, {
      action: "inventory.adjustStock",
      entityType: "Product",
      entityId: updated.id,
      metadata: { quantity }
    });

    res.json({ product: toPlain(updated) });
  })
);
