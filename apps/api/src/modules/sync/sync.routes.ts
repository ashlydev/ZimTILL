import { Router } from "express";
import { z } from "zod";
import { syncPullQuerySchema, syncPushSchema } from "@novoriq/shared";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { validateBody, validateQuery } from "../../middleware/validate";
import { handleSyncPull, handleSyncPush } from "./sync.service";

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.post(
  "/push",
  validateBody(syncPushSchema),
  asyncHandler(async (req, res) => {
    const result = await handleSyncPush(
      prisma,
      {
        merchantId: req.user!.merchantId,
        userId: req.user!.userId,
        deviceId: req.user!.deviceId
      },
      req.body
    );
    res.json(result);
  })
);

syncRouter.get(
  "/pull",
  validateQuery(syncPullQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as z.infer<typeof syncPullQuerySchema>;
    const result = await handleSyncPull(prisma, {
      merchantId: req.user!.merchantId,
      userId: req.user!.userId,
      deviceId: req.user!.deviceId
    }, query.since);
    res.json(result);
  })
);
