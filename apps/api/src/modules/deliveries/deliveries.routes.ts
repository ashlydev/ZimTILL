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

const assignDeliverySchema = z.object({
  orderId: z.string().uuid(),
  assignedToUserId: z.string().uuid().nullable().optional()
});

const updateDeliverySchema = z.object({
  status: z.enum(["ASSIGNED", "PICKED_UP", "DELIVERED", "FAILED"]),
  proofPhotoUrl: z.string().trim().max(100000).optional()
});

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const deliveriesRouter = Router();
deliveriesRouter.use(requireAuth);

deliveriesRouter.get(
  "/",
  requirePermission("deliveries.read"),
  asyncHandler(async (req, res) => {
    const deliveries = await prisma.delivery.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null,
        ...(req.user!.role === "DELIVERY_RIDER" ? { assignedToUserId: req.user!.userId } : {})
      },
      include: {
        order: true,
        assignedTo: {
          select: {
            id: true,
            identifier: true,
            role: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ deliveries: toPlain(deliveries) });
  })
);

deliveriesRouter.post(
  "/assign",
  requirePermission("deliveries.manage"),
  validateBody(assignDeliverySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof assignDeliverySchema>;
    const order = await prisma.order.findFirst({
      where: { id: body.orderId, merchantId: req.user!.merchantId, deletedAt: null }
    });

    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    const existing = await prisma.delivery.findFirst({
      where: { orderId: order.id, merchantId: req.user!.merchantId, deletedAt: null }
    });

    const now = new Date();
    const delivery = existing
      ? await prisma.delivery.update({
          where: { id: existing.id },
          data: {
            assignedToUserId: body.assignedToUserId ?? null,
            status: body.assignedToUserId ? "ASSIGNED" : "PENDING",
            updatedAt: now,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        })
      : await prisma.delivery.create({
          data: {
            id: randomUUID(),
            merchantId: req.user!.merchantId,
            branchId: order.branchId ?? req.user!.branchId ?? null,
            orderId: order.id,
            assignedToUserId: body.assignedToUserId ?? null,
            status: body.assignedToUserId ? "ASSIGNED" : "PENDING",
            proofPhotoUrl: null,
            deliveredAt: null,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

    await recordAudit(prisma, req.user!, {
      action: "delivery.assign",
      entityType: "Delivery",
      entityId: delivery.id
    });

    res.status(existing ? 200 : 201).json({ delivery: toPlain(delivery) });
  })
);

deliveriesRouter.post(
  "/:id/status",
  requirePermission("deliveries.manage"),
  validateBody(updateDeliverySchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const delivery = await prisma.delivery.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null,
        ...(req.user!.role === "DELIVERY_RIDER" ? { assignedToUserId: req.user!.userId } : {})
      }
    });

    if (!delivery) {
      throw new HttpError(404, "Delivery not found");
    }

    const body = req.body as z.infer<typeof updateDeliverySchema>;
    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: body.status,
        proofPhotoUrl: body.proofPhotoUrl ?? delivery.proofPhotoUrl,
        deliveredAt: body.status === "DELIVERED" ? new Date() : delivery.deliveredAt,
        updatedAt: new Date(),
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "delivery.updateStatus",
      entityType: "Delivery",
      entityId: updated.id,
      metadata: { status: updated.status }
    });

    res.json({ delivery: toPlain(updated) });
  })
);
