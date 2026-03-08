import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { getUsageSnapshot } from "../platform/platform.service";
import { recordAudit } from "../audit/audit.service";

const requestUpgradeSchema = z.object({
  requestedPlanCode: z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]),
  notes: z.string().trim().max(500).optional()
});

export const subscriptionsRouter = Router();

subscriptionsRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
    res.json({ plans: toPlain(plans) });
  })
);

subscriptionsRouter.use(requireAuth);

subscriptionsRouter.get(
  "/current",
  requirePermission("pricing.read"),
  asyncHandler(async (req, res) => {
    const snapshot = await getUsageSnapshot(prisma, req.user!.merchantId);
    res.json(toPlain(snapshot));
  })
);

subscriptionsRouter.post(
  "/request-upgrade",
  requirePermission("pricing.read"),
  validateBody(requestUpgradeSchema),
  asyncHandler(async (req, res) => {
    const current = await prisma.subscription.findFirst({
      where: { merchantId: req.user!.merchantId },
      orderBy: { updatedAt: "desc" }
    });
    const requestedPlan = await prisma.plan.findUnique({
      where: { code: (req.body as z.infer<typeof requestUpgradeSchema>).requestedPlanCode }
    });

    if (!requestedPlan) {
      throw new HttpError(404, "Requested plan not found");
    }

    const request = await prisma.upgradeRequest.create({
      data: {
        id: randomUUID(),
        merchantId: req.user!.merchantId,
        currentPlanId: current?.planId ?? null,
        requestedPlanId: requestedPlan.id,
        createdByUserId: req.user!.userId,
        status: "OPEN",
        notes: (req.body as z.infer<typeof requestUpgradeSchema>).notes ?? null
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "subscription.requestUpgrade",
      entityType: "UpgradeRequest",
      entityId: request.id,
      metadata: { requestedPlan: requestedPlan.code }
    });

    res.status(201).json({ request: toPlain(request) });
  })
);
