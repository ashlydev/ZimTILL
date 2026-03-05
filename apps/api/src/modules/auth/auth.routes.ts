import { Router } from "express";
import { z } from "zod";
import { loginSchema, registerSchema } from "@novoriq/shared";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { login, logout, register } from "./auth.service";
import { toPlain } from "../../lib/serialization";

const deviceIdSchema = z.string().trim().min(3).max(120);
const logoutBodySchema = z.object({
  deviceId: deviceIdSchema.optional()
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
      featureFlags: toPlain(flags)
    });
  })
);
