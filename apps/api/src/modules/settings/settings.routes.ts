import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";

const settingsUpdateSchema = z.object({
  businessName: z.string().trim().min(2).max(120).optional(),
  currencyCode: z.enum(["USD", "ZWL"]).optional(),
  currencySymbol: z.string().trim().min(1).max(5).optional(),
  paymentInstructions: z.string().trim().max(500).optional(),
  whatsappTemplate: z.string().trim().max(1000).optional(),
  supportPhone: z.string().trim().max(30).nullable().optional(),
  supportEmail: z.string().trim().email().nullable().optional()
});

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const settings = await prisma.settings.findFirst({ where: { merchantId, deletedAt: null } });

    if (!settings) {
      const now = new Date();
      const created = await prisma.settings.create({
        data: {
          id: randomUUID(),
          merchantId,
          businessName: "My Business",
          currencyCode: "USD",
          currencySymbol: "$",
          paymentInstructions: "EcoCash / ZIPIT / Bank transfer / Cash",
          whatsappTemplate:
            "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.",
          supportPhone: "+263770000000",
          supportEmail: "support@example.com",
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      res.json({ settings: toPlain(created) });
      return;
    }

    res.json({ settings: toPlain(settings) });
  })
);

settingsRouter.put(
  "/",
  validateBody(settingsUpdateSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const body = req.body as z.infer<typeof settingsUpdateSchema>;
    const existing = await prisma.settings.findFirst({ where: { merchantId, deletedAt: null } });

    const now = new Date();
    const updated = existing
      ? await prisma.settings.update({
          where: { id: existing.id },
          data: {
            ...body,
            updatedAt: now,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        })
      : await prisma.settings.create({
          data: {
            id: randomUUID(),
            merchantId,
            businessName: body.businessName ?? "My Business",
            currencyCode: body.currencyCode ?? "USD",
            currencySymbol: body.currencySymbol ?? "$",
            paymentInstructions: body.paymentInstructions ?? "EcoCash / ZIPIT / Bank transfer / Cash",
            whatsappTemplate:
              body.whatsappTemplate ??
              "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.",
            supportPhone: body.supportPhone ?? null,
            supportEmail: body.supportEmail ?? null,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

    res.json({ settings: toPlain(updated) });
  })
);
