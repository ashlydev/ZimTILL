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

const countSchema = z.object({
  productId: z.string().uuid(),
  countedQty: z.number().nonnegative(),
  notes: z.string().trim().max(300).optional()
});

const createSessionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  branchId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).optional()
});

const updateSessionSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  counts: z.array(countSchema).optional()
});

const finalizeSchema = z.object({
  counts: z.array(countSchema).min(1),
  notes: z.string().trim().max(500).optional()
});

export const stockTakesRouter = Router();
stockTakesRouter.use(requireAuth);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

stockTakesRouter.get(
  "/",
  requirePermission("stocktakes.read"),
  asyncHandler(async (req, res) => {
    const sessions = await prisma.stockTakeSession.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      include: {
        branch: true,
        category: true,
        countedByUser: { select: { id: true, identifier: true, role: true } },
        finalizedByUser: { select: { id: true, identifier: true, role: true } },
        items: {
          where: { deletedAt: null },
          include: { product: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ sessions: toPlain(sessions) });
  })
);

stockTakesRouter.post(
  "/",
  requirePermission("stocktakes.write"),
  validateBody(createSessionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSessionSchema>;
    const now = new Date();
    const session = await prisma.stockTakeSession.create({
      data: {
        merchantId: req.user!.merchantId,
        branchId: body.branchId ?? req.user!.branchId ?? null,
        categoryId: body.categoryId ?? null,
        name: body.name,
        notes: body.notes ?? null,
        countedByUserId: req.user!.userId,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "stocktake.start",
      entityType: "StockTakeSession",
      entityId: session.id,
      metadata: { name: session.name }
    });

    res.status(201).json({ session: toPlain(session) });
  })
);

stockTakesRouter.put(
  "/:id",
  requirePermission("stocktakes.write"),
  validateBody(updateSessionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSessionSchema>;
    const id = getRouteParam(req.params.id);
    const session = await prisma.stockTakeSession.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null }
    });

    if (!session) {
      throw new HttpError(404, "Stock take session not found");
    }

    if (session.status === "FINALIZED") {
      throw new HttpError(409, "This stock take has already been finalized.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.stockTakeSession.update({
        where: { id: session.id },
        data: {
          name: body.name ?? session.name,
          notes: body.notes !== undefined ? body.notes : session.notes,
          updatedAt: new Date(),
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      if (body.counts) {
        await tx.stockTakeItem.deleteMany({
          where: { sessionId: session.id, merchantId: req.user!.merchantId }
        });
        const products = await tx.product.findMany({
          where: {
            merchantId: req.user!.merchantId,
            id: { in: body.counts.map((item) => item.productId) },
            deletedAt: null
          }
        });
        const productById = new Map(products.map((product) => [product.id, product]));

        for (const item of body.counts) {
          const product = productById.get(item.productId);
          if (!product) continue;
          const systemQty = Number(product.stockQty);
          const varianceQty = Number(item.countedQty) - systemQty;
          const varianceValue = Number((varianceQty * Number(product.cost ?? product.price ?? 0)).toFixed(2));
          await tx.stockTakeItem.create({
            data: {
              merchantId: req.user!.merchantId,
              sessionId: session.id,
              productId: product.id,
              systemQty,
              countedQty: item.countedQty,
              varianceQty,
              varianceValue,
              notes: item.notes ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });
        }
      }

      return next;
    });

    res.json({ session: toPlain(await prisma.stockTakeSession.findUnique({
      where: { id: updated.id },
      include: { items: { include: { product: true }, where: { deletedAt: null } }, branch: true, category: true }
    })) });
  })
);

stockTakesRouter.post(
  "/:id/finalize",
  requirePermission("stocktakes.manage"),
  validateBody(finalizeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof finalizeSchema>;
    const id = getRouteParam(req.params.id);
    const session = await prisma.stockTakeSession.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null }
    });

    if (!session) {
      throw new HttpError(404, "Stock take session not found");
    }

    if (session.status === "FINALIZED") {
      res.json({ session: toPlain(session) });
      return;
    }

    const products = await prisma.product.findMany({
      where: {
        merchantId: req.user!.merchantId,
        id: { in: body.counts.map((item) => item.productId) },
        deletedAt: null
      }
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    if (productById.size !== body.counts.length) {
      throw new HttpError(404, "One or more products in this stock take no longer exist.", "PRODUCT_NOT_FOUND");
    }

    const now = new Date();
    const finalized = await prisma.$transaction(async (tx) => {
      await tx.stockTakeItem.deleteMany({
        where: { sessionId: session.id, merchantId: req.user!.merchantId }
      });

      let varianceQty = 0;
      let varianceValue = 0;
      for (const item of body.counts) {
        const product = productById.get(item.productId)!;
        const systemQty = Number(product.stockQty);
        const nextQty = Number(item.countedQty);
        const delta = nextQty - systemQty;
        const deltaValue = Number((delta * Number(product.cost ?? product.price ?? 0)).toFixed(2));
        varianceQty += delta;
        varianceValue += deltaValue;

        await tx.stockTakeItem.create({
          data: {
            merchantId: req.user!.merchantId,
            sessionId: session.id,
            productId: product.id,
            systemQty,
            countedQty: nextQty,
            varianceQty: delta,
            varianceValue: deltaValue,
            notes: item.notes ?? null,
            createdAt: now,
            updatedAt: now,
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

        if (delta !== 0) {
          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQty: nextQty,
              updatedByUserId: req.user!.userId,
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });

          await tx.stockMovement.create({
            data: {
              id: randomUUID(),
              merchantId: req.user!.merchantId,
              branchId: session.branchId ?? null,
              productId: product.id,
              createdByUserId: req.user!.userId,
              updatedByUserId: req.user!.userId,
              type: delta >= 0 ? "IN" : "OUT",
              quantity: delta,
              reason: `Stock take variance ${session.name}`,
              orderId: null,
              createdAt: now,
              updatedAt: now,
              version: 1,
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });
        }
      }

      return tx.stockTakeSession.update({
        where: { id: session.id },
        data: {
          status: "FINALIZED",
          notes: body.notes ?? session.notes,
          finalizedByUserId: req.user!.userId,
          finalizedAt: now,
          varianceQty,
          varianceValue,
          updatedAt: now,
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });
    });

    await createNotification(prisma, {
      merchantId: req.user!.merchantId,
      branchId: finalized.branchId ?? null,
      type: "STOCK_TAKE_COMPLETED",
      title: "Stock take finalized",
      message: `${finalized.name} was finalized with variance value ${finalized.varianceValue}.`,
      entityType: "StockTakeSession",
      entityId: finalized.id,
      severity: Number(finalized.varianceValue) === 0 ? "success" : "warning",
      visibility: "MANAGEMENT"
    });

    if (Math.abs(Number(finalized.varianceValue)) > 0) {
      await createNotification(prisma, {
        merchantId: req.user!.merchantId,
        branchId: finalized.branchId ?? null,
        type: "STOCK_VARIANCE",
        title: "Stock variance detected",
        message: `${finalized.name} produced a variance of ${finalized.varianceValue}.`,
        entityType: "StockTakeSession",
        entityId: finalized.id,
        severity: "warning",
        visibility: "MANAGEMENT"
      });
    }

    await recordAudit(prisma, req.user!, {
      action: "stocktake.finalize",
      entityType: "StockTakeSession",
      entityId: finalized.id,
      metadata: { varianceQty: Number(finalized.varianceQty), varianceValue: Number(finalized.varianceValue) }
    });

    res.json({ session: toPlain(await prisma.stockTakeSession.findUnique({
      where: { id: finalized.id },
      include: {
        items: { where: { deletedAt: null }, include: { product: true } },
        branch: true,
        category: true,
        countedByUser: { select: { id: true, identifier: true, role: true } },
        finalizedByUser: { select: { id: true, identifier: true, role: true } }
      }
    })) });
  })
);
