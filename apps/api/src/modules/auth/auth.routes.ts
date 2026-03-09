import { Router } from "express";
import { z } from "zod";
import { loginSchema, registerSchema } from "@novoriq/shared";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { getPlatformAdminEmail, verifyPlatformAdminCredentials } from "../../config/platform-admin";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { login, logout, register } from "./auth.service";
import { toPlain } from "../../lib/serialization";
import { signToken } from "../../lib/token";

const deviceIdSchema = z.string().trim().min(3).max(120);
const logoutBodySchema = z.object({
  deviceId: deviceIdSchema.optional()
});
const platformAdminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post(
  "/register",
  validateBody(registerSchema.extend({ deviceId: deviceIdSchema })),
  asyncHandler(async (req, res) => {
    const body = req.body as { businessName: string; identifier: string; pin: string; deviceId: string };
    const result = await register(prisma, body, body.deviceId);
    res.status(201).json(result);
  })
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await login(prisma, req.body);
    res.json(result);
  })
);

authRouter.post(
  "/platform-admin/login",
  validateBody(platformAdminLoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof platformAdminLoginSchema>;
    const platformAdminEmail = getPlatformAdminEmail();
    const matches = await verifyPlatformAdminCredentials(email, password);

    if (!matches) {
      throw new HttpError(401, "Invalid platform admin credentials");
    }

    const token = signToken({
      userId: "platform-admin",
      merchantId: "platform-admin",
      role: "ADMIN",
      identifier: platformAdminEmail,
      deviceId: "platform-admin",
      branchId: null,
      platformAccess: true,
      scope: "platform_admin",
      email: platformAdminEmail
    });

    res.json({
      token,
      user: {
        id: "platform-admin",
        identifier: platformAdminEmail,
        role: "ADMIN",
        isActive: true,
        isPlatformAdmin: true
      }
    });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  validateBody(logoutBodySchema),
  asyncHandler(async (req, res) => {
    const deviceId = (req.body as { deviceId?: string }).deviceId ?? req.user?.deviceId;

    if (!req.user || !deviceId) {
      throw new HttpError(401, "Unauthorized");
    }

    await logout(prisma, req.user.merchantId, deviceId);
    res.json({ success: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw new HttpError(401, "Unauthorized");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: req.user.userId,
        merchantId: req.user.merchantId,
        deletedAt: null
      }
    });

    if (!user) {
      throw new HttpError(401, "Unauthorized");
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: req.user.merchantId } });
    const settings = await prisma.settings.findFirst({ where: { merchantId: req.user.merchantId, deletedAt: null } });
    const branches = await prisma.branch.findMany({
      where: { merchantId: req.user.merchantId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
    const subscription = await prisma.subscription.findFirst({
      where: { merchantId: req.user.merchantId },
      include: { plan: true },
      orderBy: { updatedAt: "desc" }
    });
    const flags = await prisma.featureFlag.findMany({
      where: {
        deletedAt: null,
        OR: [{ merchantId: null }, { merchantId: req.user.merchantId }]
      }
    });

    res.json({
      user: toPlain(user),
      merchant: toPlain(merchant),
      settings: toPlain(settings),
      branches: toPlain(branches),
      activeBranchId: req.user.branchId ?? null,
      subscription: toPlain(subscription),
      featureFlags: toPlain(flags)
    });
  })
);
