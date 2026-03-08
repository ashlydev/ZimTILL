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

const transferCreateSchema = z.object({
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  notes: z.string().trim().max(240).optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).min(1)
});

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function ensureProductStock(
  tx: typeof prisma,
  merchantId: string,
  branchId: string,
  productId: string,
  deviceId: string
) {
  const existing = await tx.productStock.findFirst({
    where: { merchantId, branchId, productId, deletedAt: null }
  });

  if (existing) return existing;

  const now = new Date();
  return tx.productStock.create({
    data: {
      id: randomUUID(),
      merchantId,
      branchId,
      productId,
      qty: 0,
      lowStockThreshold: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      lastModifiedByDeviceId: deviceId
    }
  });
}

export const transfersRouter = Router();
transfersRouter.use(requireAuth);

transfersRouter.get(
  "/",
  requirePermission("transfers.read"),
  asyncHandler(async (req, res) => {
    const transfers = await prisma.stockTransfer.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      include: {
        fromBranch: true,
        toBranch: true,
        items: { include: { product: true } }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ transfers: toPlain(transfers) });
  })
);

transfersRouter.post(
  "/",
  requirePermission("transfers.write"),
  validateBody(transferCreateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof transferCreateSchema>;
    if (body.fromBranchId === body.toBranchId) {
      throw new HttpError(400, "Choose two different branches");
    }

    const now = new Date();
    const transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          id: randomUUID(),
          merchantId: req.user!.merchantId,
          fromBranchId: body.fromBranchId,
          toBranchId: body.toBranchId,
          status: "DRAFT",
          requestedByUserId: req.user!.userId,
          approvedByUserId: null,
          receivedByUserId: null,
          notes: body.notes ?? null,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      await tx.stockTransferItem.createMany({
        data: body.items.map((item) => ({
          id: randomUUID(),
          merchantId: req.user!.merchantId,
          transferId: created.id,
          productId: item.productId,
          quantity: item.quantity,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: req.user!.deviceId
        }))
      });

      return created;
    });

    await recordAudit(prisma, req.user!, {
      action: "transfer.create",
      entityType: "StockTransfer",
      entityId: transfer.id
    });

    res.status(201).json({ transfer: toPlain(transfer) });
  })
);

transfersRouter.post(
  "/:id/approve",
  requirePermission("transfers.write"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null },
      include: { items: true }
    });

    if (!transfer) {
      throw new HttpError(404, "Transfer not found");
    }

    const now = new Date();
    const approved = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const fromStock = await tx.productStock.findFirst({
          where: {
            merchantId: req.user!.merchantId,
            branchId: transfer.fromBranchId,
            productId: item.productId,
            deletedAt: null
          }
        });

        if (!fromStock || Number(fromStock.qty) < Number(item.quantity)) {
          throw new HttpError(400, "Insufficient stock to approve transfer");
        }

        await tx.productStock.update({
          where: { id: fromStock.id },
          data: {
            qty: Number(fromStock.qty) - Number(item.quantity),
            updatedAt: now,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            merchantId: req.user!.merchantId,
            branchId: transfer.fromBranchId,
            productId: item.productId,
            type: "TRANSFER_OUT",
            quantity: -Number(item.quantity),
            reason: `Transfer approved ${transfer.id}`,
            orderId: null,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });
      }

      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "APPROVED",
          approvedByUserId: req.user!.userId,
          updatedAt: now,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });
    });

    await recordAudit(prisma, req.user!, {
      action: "transfer.approve",
      entityType: "StockTransfer",
      entityId: approved.id
    });

    res.json({ transfer: toPlain(approved) });
  })
);

transfersRouter.post(
  "/:id/receive",
  requirePermission("transfers.write"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null },
      include: { items: true }
    });

    if (!transfer) {
      throw new HttpError(404, "Transfer not found");
    }

    if (transfer.status !== "APPROVED" && transfer.status !== "IN_TRANSIT") {
      throw new HttpError(400, "Transfer is not ready to receive");
    }

    const now = new Date();
    const received = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const targetStock = await ensureProductStock(
          tx as typeof prisma,
          req.user!.merchantId,
          transfer.toBranchId,
          item.productId,
          req.user!.deviceId
        );
        await tx.productStock.update({
          where: { id: targetStock.id },
          data: {
            qty: Number(targetStock.qty) + Number(item.quantity),
            updatedAt: now,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            merchantId: req.user!.merchantId,
            branchId: transfer.toBranchId,
            productId: item.productId,
            type: "TRANSFER_IN",
            quantity: Number(item.quantity),
            reason: `Transfer received ${transfer.id}`,
            orderId: null,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });
      }

      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "RECEIVED",
          receivedByUserId: req.user!.userId,
          updatedAt: now,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });
    });

    await recordAudit(prisma, req.user!, {
      action: "transfer.receive",
      entityType: "StockTransfer",
      entityId: received.id
    });

    res.json({ transfer: toPlain(received) });
  })
);
