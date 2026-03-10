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
import { createNotification } from "../notifications/notifications.service";

const purchaseItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative()
});

const createPurchaseSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(purchaseItemInputSchema).min(1),
  receiveNow: z.boolean().optional()
});

function lineTotal(quantity: number, unitCost: number): number {
  return Number((quantity * unitCost).toFixed(2));
}

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth);

purchasesRouter.get(
  "/",
  requirePermission("purchases.read"),
  asyncHandler(async (req, res) => {
    const purchases = await prisma.purchase.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      include: {
        supplier: true,
        items: { include: { product: true }, where: { deletedAt: null } },
        createdByUser: { select: { id: true, identifier: true, role: true } },
        updatedByUser: { select: { id: true, identifier: true, role: true } }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ purchases: toPlain(purchases) });
  })
);

async function receivePurchase(purchaseId: string, user: NonNullable<Express.Request["user"]>) {
  const existing = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      merchantId: user.merchantId,
      deletedAt: null
    },
    include: {
      items: { where: { deletedAt: null } },
      supplier: true
    }
  });

  if (!existing) {
    throw new HttpError(404, "Purchase not found");
  }

  if (existing.status === "RECEIVED") {
    return existing;
  }

  const now = new Date();
  const received = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.update({
      where: { id: existing.id },
      data: {
        status: "RECEIVED",
        receivedAt: now,
        updatedByUserId: user.userId,
        updatedAt: now,
        lastModifiedByDeviceId: user.deviceId
      }
    });

    for (const item of existing.items) {
      const product = await tx.product.findFirst({
        where: {
          id: item.productId,
          merchantId: user.merchantId,
          deletedAt: null
        }
      });

      if (!product) {
        throw new HttpError(404, "A product in this purchase no longer exists.", "PRODUCT_NOT_FOUND");
      }

      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQty: Number(product.stockQty) + Number(item.quantity),
          cost: Number(item.unitCost),
          updatedByUserId: user.userId,
          updatedAt: now,
          version: { increment: 1 },
          lastModifiedByDeviceId: user.deviceId
        }
      });

      if (purchase.branchId) {
        const branchStock = await tx.productStock.findFirst({
          where: {
            merchantId: user.merchantId,
            branchId: purchase.branchId,
            productId: product.id,
            deletedAt: null
          }
        });

        if (branchStock) {
          await tx.productStock.update({
            where: { id: branchStock.id },
            data: {
              qty: Number(branchStock.qty) + Number(item.quantity),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: user.deviceId
            }
          });
        } else {
          await tx.productStock.create({
            data: {
              merchantId: user.merchantId,
              branchId: purchase.branchId,
              productId: product.id,
              qty: Number(item.quantity),
              lowStockThreshold: Number(product.lowStockThreshold),
              createdAt: now,
              updatedAt: now,
              lastModifiedByDeviceId: user.deviceId
            }
          });
        }
      }

      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          merchantId: user.merchantId,
          branchId: purchase.branchId ?? null,
          productId: product.id,
          createdByUserId: user.userId,
          updatedByUserId: user.userId,
          type: "IN",
          quantity: item.quantity,
          reason: `Purchase received ${purchase.reference ?? purchase.id.slice(0, 8)}`,
          orderId: null,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: user.deviceId
        }
      });
    }

    return purchase;
  });

  await createNotification(prisma, {
    merchantId: user.merchantId,
    branchId: received.branchId ?? null,
    type: "PURCHASE_RECEIVED",
    title: "Purchase received",
    message: `${existing.supplier?.name ?? "Supplier"} delivery added ${existing.items.length} line(s) into stock.`,
    entityType: "Purchase",
    entityId: received.id,
    severity: "success",
    visibility: "MANAGEMENT"
  });

  return received;
}

purchasesRouter.post(
  "/",
  requirePermission("purchases.write"),
  validateBody(createPurchaseSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createPurchaseSchema>;
    const branchId = body.branchId ?? req.user!.branchId ?? null;
    const productIds = [...new Set(body.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });
    if (products.length !== productIds.length) {
      throw new HttpError(404, "One or more products in this purchase are missing.", "PRODUCT_NOT_FOUND");
    }

    const totalCost = body.items.reduce((sum, item) => sum + lineTotal(item.quantity, item.unitCost), 0);
    const now = new Date();
    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          merchantId: req.user!.merchantId,
          branchId,
          supplierId: body.supplierId ?? null,
          createdByUserId: req.user!.userId,
          updatedByUserId: req.user!.userId,
          status: body.receiveNow ? "RECEIVED" : "DRAFT",
          reference: body.reference ?? null,
          notes: body.notes ?? null,
          totalCost,
          receivedAt: body.receiveNow ? now : null,
          createdAt: now,
          updatedAt: now,
          lastModifiedByDeviceId: req.user!.deviceId,
          items: {
            create: body.items.map((item) => ({
              merchantId: req.user!.merchantId,
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              lineTotal: lineTotal(item.quantity, item.unitCost),
              createdAt: now,
              updatedAt: now,
              lastModifiedByDeviceId: req.user!.deviceId
            }))
          }
        },
        include: {
          items: { include: { product: true } },
          supplier: true
        }
      });
      return created;
    });

    if (body.receiveNow) {
      await receivePurchase(purchase.id, req.user!);
    }

    await recordAudit(prisma, req.user!, {
      action: "purchase.create",
      entityType: "Purchase",
      entityId: purchase.id,
      metadata: { totalCost, receiveNow: Boolean(body.receiveNow) }
    });

    res.status(201).json({ purchase: toPlain(await prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: { supplier: true, items: { include: { product: true }, where: { deletedAt: null } } }
    })) });
  })
);

purchasesRouter.post(
  "/:id/receive",
  requirePermission("purchases.write"),
  asyncHandler(async (req, res) => {
    const purchase = await receivePurchase(getRouteParam(req.params.id), req.user!);

    await recordAudit(prisma, req.user!, {
      action: "purchase.receive",
      entityType: "Purchase",
      entityId: purchase.id
    });

    res.json({ purchase: toPlain(await prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: { supplier: true, items: { include: { product: true }, where: { deletedAt: null } } }
    })) });
  })
);
