import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { toPlain } from "../../lib/serialization";

export const merchantsRouter = Router();
merchantsRouter.use(requireAuth);

merchantsRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const merchant = await prisma.merchant.findUnique({ where: { id: req.user!.merchantId } });
    const owner = await prisma.user.findFirst({
      where: { merchantId: req.user!.merchantId, role: "OWNER", deletedAt: null }
    });

    res.json({ merchant: toPlain(merchant), owner: toPlain(owner) });
  })
);
