import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";

const updateFlagSchema = z.object({
  key: z.string().trim().min(2).max(100),
  enabled: z.boolean()
});

export const flagsRouter = Router();
flagsRouter.use(requireAuth);

flagsRouter.get(
  "/",
  requirePermission("settings.read"),
  asyncHandler(async (req, res) => {
    const flags = await prisma.featureFlag.findMany({
      where: {
        deletedAt: null,
        OR: [{ merchantId: null }, { merchantId: req.user!.merchantId }]
      },
      orderBy: { key: "asc" }
    });

    res.json({ flags: toPlain(flags) });
  })
);

flagsRouter.put(
  "/",
  requirePermission("settings.write"),
  validateBody(updateFlagSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateFlagSchema>;

    const flag = await prisma.featureFlag.upsert({
      where: {
        key_merchantId: {
          key: body.key,
          merchantId: req.user!.merchantId
        }
      },
      create: {
        key: body.key,
        enabled: body.enabled,
        merchantId: req.user!.merchantId
      },
      update: {
        enabled: body.enabled,
        updatedAt: new Date()
      }
    });

    res.json({ flag: toPlain(flag) });
  })
);
