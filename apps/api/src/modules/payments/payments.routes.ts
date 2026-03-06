import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { paymentMethodValues } from "@novoriq/shared";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { updateOrderPaymentStatus } from "../orders/order-utils";
import { handlePaynowWebhook, initiatePaynow, pollPaynowStatus } from "./paynow.service";
import { recordAudit } from "../audit/audit.service";

const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(paymentMethodValues),
  reference: z.string().trim().max(100).optional(),
  paidAt: z.string().datetime().optional()
});

export const paymentsRouter = Router();
paymentsRouter.post(
  "/paynow/webhook",
  asyncHandler(async (req, res) => {
    await handlePaynowWebhook(prisma, req.body as Record<string, unknown>);
    res.status(200).json({ success: true });
  })
);

paymentsRouter.use(requireAuth);

paymentsRouter.get(
  "/",
  requirePermission("payments.read"),
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      orderBy: { paidAt: "desc" }
    });

    res.json({ payments: toPlain(payments) });
  })
);

paymentsRouter.post(
  "/",
  requirePermission("payments.write"),
  validateBody(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createPaymentSchema>;
    const merchantId = req.user!.merchantId;

    const order = await prisma.order.findFirst({ where: { id: body.orderId, merchantId, deletedAt: null } });
    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    const now = new Date();

    const payment = await prisma.payment.create({
      data: {
        id: randomUUID(),
        merchantId,
        orderId: body.orderId,
        amount: body.amount,
        method: body.method,
        reference: body.reference ?? null,
        paidAt: body.paidAt ? new Date(body.paidAt) : now,
        status: "CONFIRMED",
        paynowTransactionId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await updateOrderPaymentStatus(prisma, order.id, merchantId);

    await recordAudit(prisma, req.user!, {
      action: "payment.create",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { method: payment.method, amount: Number(payment.amount) }
    });

    res.status(201).json({ payment: toPlain(payment) });
  })
);

paymentsRouter.post(
  "/paynow/initiate",
  requirePermission("payments.write"),
  validateBody(
    z.object({
      orderId: z.string().uuid(),
      amount: z.number().positive(),
      method: z.enum(["ecocash", "onemoney", "web", "card", "other"]),
      phone: z.string().trim().min(7).max(20).optional()
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await initiatePaynow(prisma, req.user!.merchantId, req.user!.identifier, req.body);

    await recordAudit(prisma, req.user!, {
      action: "payment.paynowInitiate",
      entityType: "PaynowTransaction",
      entityId: result.transactionId
    });

    res.status(201).json(result);
  })
);

paymentsRouter.post(
  "/paynow/status",
  requirePermission("payments.write"),
  validateBody(z.object({ transactionId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const result = await pollPaynowStatus(prisma, req.user!.merchantId, req.body);

    await recordAudit(prisma, req.user!, {
      action: "payment.paynowStatus",
      entityType: "PaynowTransaction",
      entityId: (req.body as { transactionId: string }).transactionId,
      metadata: { status: result.status }
    });

    res.json(result);
  })
);
