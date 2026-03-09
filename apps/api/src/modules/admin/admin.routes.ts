import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePlatformAccess } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { signToken } from "../../lib/token";
import { recordAudit } from "../audit/audit.service";

const disableUserSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean()
});

const resetPinSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().regex(/^[0-9]{4,6}$/)
});

const impersonateSchema = z.object({
  merchantId: z.string().uuid(),
  userId: z.string().uuid().optional()
});

const merchantPlanCodeSchema = z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]);

const merchantStatusSchema = z.object({
  merchantId: z.string().uuid(),
  isActive: z.boolean(),
  notes: z.string().trim().max(500).optional(),
  paymentReference: z.string().trim().max(120).optional()
});

const extendTrialSchema = z.object({
  merchantId: z.string().uuid(),
  days: z.number().int().min(1).max(365)
});

const setPlanSchema = z.object({
  merchantId: z.string().uuid(),
  planCode: merchantPlanCodeSchema,
  durationDays: z.number().int().min(1).max(365).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  notes: z.string().trim().max(500).optional(),
  paymentReference: z.string().trim().max(120).optional()
});

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requirePlatformAccess);

adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [merchants, subscriptions, openUpgradeRequests] = await Promise.all([
      prisma.merchant.count({ where: { deletedAt: null } }),
      prisma.subscription.findMany({
        include: { plan: true },
        orderBy: { updatedAt: "desc" },
        take: 20
      }),
      prisma.upgradeRequest.count({ where: { status: "OPEN" } })
    ]);

    res.json({
      totals: {
        merchants,
        openUpgradeRequests
      },
      subscriptions: toPlain(subscriptions)
    });
  })
);

adminRouter.get(
  "/merchants",
  asyncHandler(async (_req, res) => {
    const merchants = await prisma.merchant.findMany({
      where: { deletedAt: null },
      include: {
        users: {
          where: { deletedAt: null, role: "OWNER" },
          orderBy: { createdAt: "asc" },
          take: 1
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { updatedAt: "desc" },
          take: 1
        },
        usageCounters: {
          orderBy: { updatedAt: "desc" },
          take: 20
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ merchants: toPlain(merchants) });
  })
);

adminRouter.post(
  "/merchants/status",
  validateBody(merchantStatusSchema),
  asyncHandler(async (req, res) => {
    const { merchantId, isActive, notes, paymentReference } = req.body as z.infer<typeof merchantStatusSchema>;
    const merchant = await prisma.merchant.findFirst({ where: { id: merchantId, deletedAt: null } });

    if (!merchant) {
      throw new HttpError(404, "Merchant not found");
    }

    const updated = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        isActive,
        updatedAt: new Date()
      }
    });

    await recordAudit(prisma, req.user!, {
      action: isActive ? "admin.activateMerchant" : "admin.deactivateMerchant",
      entityType: "Merchant",
      entityId: merchantId,
      metadata: {
        notes: notes ?? null,
        paymentReference: paymentReference ?? null
      }
    });

    res.json({ merchant: toPlain(updated) });
  })
);

adminRouter.post(
  "/merchants/extend-trial",
  validateBody(extendTrialSchema),
  asyncHandler(async (req, res) => {
    const { merchantId, days } = req.body as z.infer<typeof extendTrialSchema>;
    const merchant = await prisma.merchant.findFirst({ where: { id: merchantId, deletedAt: null } });

    if (!merchant) {
      throw new HttpError(404, "Merchant not found");
    }

    const starterPlan = await prisma.plan.findUnique({ where: { code: "STARTER" } });
    if (!starterPlan) {
      throw new HttpError(404, "Starter plan not found");
    }

    const current = await prisma.subscription.findFirst({
      where: { merchantId },
      orderBy: { updatedAt: "desc" }
    });

    const now = new Date();
    const nextEnd = new Date(now);
    nextEnd.setDate(nextEnd.getDate() + days);

    const subscription = current
      ? await prisma.subscription.update({
          where: { id: current.id },
          data: {
            planId: starterPlan.id,
            status: "TRIALING",
            billingPeriodStart: now,
            billingPeriodEnd: nextEnd
          },
          include: { plan: true }
        })
      : await prisma.subscription.create({
          data: {
            merchantId,
            planId: starterPlan.id,
            status: "TRIALING",
            billingPeriodStart: now,
            billingPeriodEnd: nextEnd
          },
          include: { plan: true }
        });

    await recordAudit(prisma, req.user!, {
      action: "admin.extendTrial",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: { merchantId, days }
    });

    res.json({ subscription: toPlain(subscription) });
  })
);

adminRouter.post(
  "/merchants/set-plan",
  validateBody(setPlanSchema),
  asyncHandler(async (req, res) => {
    const { merchantId, planCode, durationDays, status, notes, paymentReference } = req.body as z.infer<typeof setPlanSchema>;
    const merchant = await prisma.merchant.findFirst({ where: { id: merchantId, deletedAt: null } });

    if (!merchant) {
      throw new HttpError(404, "Merchant not found");
    }

    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new HttpError(404, "Plan not found");
    }

    const current = await prisma.subscription.findFirst({
      where: { merchantId },
      orderBy: { updatedAt: "desc" }
    });

    const now = new Date();
    const nextEnd = new Date(now);
    nextEnd.setDate(nextEnd.getDate() + (durationDays ?? 30));
    const nextStatus = status ?? "ACTIVE";

    const subscription = current
      ? await prisma.subscription.update({
          where: { id: current.id },
          data: {
            planId: plan.id,
            status: nextStatus,
            billingPeriodStart: now,
            billingPeriodEnd: nextEnd,
            cancelledAt: nextStatus === "CANCELLED" ? now : null
          },
          include: { plan: true }
        })
      : await prisma.subscription.create({
          data: {
            merchantId,
            planId: plan.id,
            status: nextStatus,
            billingPeriodStart: now,
            billingPeriodEnd: nextEnd,
            cancelledAt: nextStatus === "CANCELLED" ? now : null
          },
          include: { plan: true }
        });

    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        isActive: nextStatus !== "CANCELLED"
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "admin.setPlan",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: {
        merchantId,
        planCode,
        durationDays: durationDays ?? 30,
        status: nextStatus,
        notes: notes ?? null,
        paymentReference: paymentReference ?? null
      }
    });

    res.json({ subscription: toPlain(subscription) });
  })
);

adminRouter.get(
  "/feature-flags",
  asyncHandler(async (_req, res) => {
    const flags = await prisma.featureFlag.findMany({
      where: { deletedAt: null },
      orderBy: [{ merchantId: "asc" }, { key: "asc" }]
    });

    res.json({ flags: toPlain(flags) });
  })
);

adminRouter.post(
  "/support/disable-user",
  validateBody(disableUserSchema),
  asyncHandler(async (req, res) => {
    const { userId, isActive } = req.body as z.infer<typeof disableUserSchema>;
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isActive,
        updatedAt: new Date()
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "admin.disableUser",
      entityType: "User",
      entityId: updated.id,
      metadata: { isActive }
    });

    res.json({ user: toPlain(updated) });
  })
);

adminRouter.post(
  "/support/reset-pin",
  validateBody(resetPinSchema),
  asyncHandler(async (req, res) => {
    const { userId, pin } = req.body as z.infer<typeof resetPinSchema>;
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash, updatedAt: new Date() }
    });

    await prisma.userAuth.updateMany({
      where: { userId: user.id },
      data: { pinHash, updatedAt: new Date() }
    });

    await recordAudit(prisma, req.user!, {
      action: "admin.resetPin",
      entityType: "User",
      entityId: user.id
    });

    res.json({ success: true });
  })
);

adminRouter.post(
  "/support/impersonate",
  validateBody(impersonateSchema),
  asyncHandler(async (req, res) => {
    const { merchantId, userId } = req.body as z.infer<typeof impersonateSchema>;
    const user =
      (userId
        ? await prisma.user.findFirst({
            where: { id: userId, merchantId, deletedAt: null, isActive: true }
          })
        : null) ??
      (await prisma.user.findFirst({
        where: { merchantId, role: "OWNER", deletedAt: null, isActive: true },
        orderBy: { createdAt: "asc" }
      }));

    if (!user) {
      throw new HttpError(404, "Merchant user not found");
    }

    const device = await prisma.device.findFirst({
      where: { merchantId, userId: user.id, deletedAt: null, revokedAt: null },
      orderBy: { updatedAt: "desc" }
    });

    const token = signToken({
      userId: user.id,
      merchantId,
      role: user.role,
      identifier: user.identifier,
      deviceId: device?.deviceId ?? "admin-impersonation",
      branchId: device?.activeBranchId ?? user.defaultBranchId ?? null,
      platformAccess: true
    });

    await recordAudit(prisma, req.user!, {
      action: "admin.impersonate",
      entityType: "Merchant",
      entityId: merchantId,
      metadata: { userId: user.id }
    });

    res.json({ token, user: toPlain(user) });
  })
);
