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

const openCashUpSchema = z.object({
  openingFloat: z.number().nonnegative(),
  notes: z.string().trim().max(300).optional()
});

const submitCashUpSchema = z.object({
  countedCash: z.number().nonnegative(),
  notes: z.string().trim().max(300).optional()
});

function cashPaymentsWhere(merchantId: string, branchId: string | null | undefined, userId: string, openedAt: Date) {
  return {
    merchantId,
    ...(branchId ? { branchId } : {}),
    createdByUserId: userId,
    method: "CASH" as const,
    status: "CONFIRMED" as const,
    deletedAt: null,
    paidAt: { gte: openedAt }
  };
}

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const cashUpsRouter = Router();
cashUpsRouter.use(requireAuth);

cashUpsRouter.get(
  "/",
  requirePermission("cashups.read"),
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === "CASHIER"
        ? { merchantId: req.user!.merchantId, userId: req.user!.userId, deletedAt: null }
        : { merchantId: req.user!.merchantId, deletedAt: null };

    const sessions = await prisma.cashUpSession.findMany({
      where,
      include: {
        user: { select: { id: true, identifier: true, role: true } },
        approvedByUser: { select: { id: true, identifier: true, role: true } },
        branch: true
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ sessions: toPlain(sessions) });
  })
);

cashUpsRouter.post(
  "/open",
  requirePermission("cashups.write"),
  validateBody(openCashUpSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof openCashUpSchema>;
    const existingOpen = await prisma.cashUpSession.findFirst({
      where: {
        merchantId: req.user!.merchantId,
        userId: req.user!.userId,
        status: "OPEN",
        deletedAt: null
      }
    });

    if (existingOpen) {
      throw new HttpError(409, "You already have an open cash-up session.");
    }

    const now = new Date();
    const session = await prisma.cashUpSession.create({
      data: {
        merchantId: req.user!.merchantId,
        branchId: req.user!.branchId ?? null,
        userId: req.user!.userId,
        openingFloat: body.openingFloat,
        notes: body.notes ?? null,
        openedAt: now,
        createdAt: now,
        updatedAt: now,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "cashup.open",
      entityType: "CashUpSession",
      entityId: session.id,
      metadata: { openingFloat: Number(session.openingFloat) }
    });

    res.status(201).json({ session: toPlain(session) });
  })
);

cashUpsRouter.post(
  "/:id/submit",
  requirePermission("cashups.write"),
  validateBody(submitCashUpSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof submitCashUpSchema>;
    const id = getRouteParam(req.params.id);
    const session = await prisma.cashUpSession.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!session) {
      throw new HttpError(404, "Cash-up session not found");
    }

    if (session.status !== "OPEN") {
      throw new HttpError(409, "This cash-up session has already been submitted.");
    }

    const payments = await prisma.payment.findMany({
      where: cashPaymentsWhere(req.user!.merchantId, session.branchId, session.userId, session.openedAt)
    });
    const expectedCash = Number(session.openingFloat) + payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const variance = Number((body.countedCash - expectedCash).toFixed(2));
    const now = new Date();

    const updated = await prisma.cashUpSession.update({
      where: { id: session.id },
      data: {
        status: "SUBMITTED",
        countedCash: body.countedCash,
        expectedCash,
        variance,
        notes: body.notes ?? session.notes,
        submittedAt: now,
        updatedAt: now,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await createNotification(prisma, {
      merchantId: req.user!.merchantId,
      branchId: session.branchId ?? null,
      type: "CASH_UP_SUBMITTED",
      title: "Cash-up submitted",
      message: `${req.user!.identifier} submitted cash-up with variance ${variance.toFixed(2)}.`,
      entityType: "CashUpSession",
      entityId: updated.id,
      severity: variance === 0 ? "success" : "warning",
      visibility: "MANAGEMENT"
    });

    if (variance !== 0) {
      await createNotification(prisma, {
        merchantId: req.user!.merchantId,
        branchId: session.branchId ?? null,
        type: "CASH_UP_VARIANCE",
        title: "Cash-up variance",
        message: `Cash-up variance detected: ${variance.toFixed(2)} for ${req.user!.identifier}.`,
        entityType: "CashUpSession",
        entityId: updated.id,
        severity: "warning",
        visibility: "MANAGEMENT"
      });
    }

    await recordAudit(prisma, req.user!, {
      action: "cashup.submit",
      entityType: "CashUpSession",
      entityId: updated.id,
      metadata: { expectedCash, countedCash: body.countedCash, variance }
    });

    res.json({ session: toPlain(updated) });
  })
);

cashUpsRouter.post(
  "/:id/approve",
  requirePermission("cashups.manage"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const session = await prisma.cashUpSession.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!session) {
      throw new HttpError(404, "Cash-up session not found");
    }

    if (session.status !== "SUBMITTED") {
      throw new HttpError(409, "Only submitted cash-ups can be approved.");
    }

    const updated = await prisma.cashUpSession.update({
      where: { id: session.id },
      data: {
        status: "APPROVED",
        approvedByUserId: req.user!.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "cashup.approve",
      entityType: "CashUpSession",
      entityId: updated.id
    });

    res.json({ session: toPlain(updated) });
  })
);
