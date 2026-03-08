import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import {
  createPublicCatalogCheckout,
  getPublicCatalog,
  publicCheckoutSchema,
  updateCatalogSettingsSchema,
  updateMerchantCatalogSettings
} from "./catalog.service";

export const catalogRouter = Router();

catalogRouter.get(
  "/:merchantSlug",
  asyncHandler(async (req, res) => {
    const merchantSlug = String(req.params.merchantSlug ?? "");
    res.json(await getPublicCatalog(prisma, merchantSlug));
  })
);

catalogRouter.post(
  "/:merchantSlug/checkout",
  validateBody(publicCheckoutSchema),
  asyncHandler(async (req, res) => {
    const merchantSlug = String(req.params.merchantSlug ?? "");
    const body = req.body as z.infer<typeof publicCheckoutSchema>;
    res.status(201).json(await createPublicCatalogCheckout(prisma, merchantSlug, body));
  })
);

catalogRouter.use(requireAuth);

catalogRouter.get(
  "/settings/me",
  requirePermission("catalog.read"),
  asyncHandler(async (req, res) => {
    const settings = await prisma.catalogSettings.findFirst({
      where: { merchantId: req.user!.merchantId, deletedAt: null }
    });
    res.json({ settings: toPlain(settings) });
  })
);

catalogRouter.put(
  "/settings/me",
  requirePermission("catalog.write"),
  validateBody(updateCatalogSettingsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateCatalogSettingsSchema>;
    res.json(await updateMerchantCatalogSettings(prisma, req.user!, body));
  })
);
