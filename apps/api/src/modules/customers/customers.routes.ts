import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional()
});

const customerUpdateSchema = customerCreateSchema.partial();

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const customers = await prisma.customer.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ customers: toPlain(customers) });
  })
);

customersRouter.post(
  "/",
  validateBody(customerCreateSchema),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const body = req.body as z.infer<typeof customerCreateSchema>;

    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        merchantId: req.user!.merchantId,
        name: body.name,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    res.status(201).json({ customer: toPlain(customer) });
  })
);

customersRouter.put(
  "/:id",
  validateBody(customerUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const existing = await prisma.customer.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null }
    });

    if (!existing) {
      throw new HttpError(404, "Customer not found");
    }

    const body = req.body as z.infer<typeof customerUpdateSchema>;

    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        ...body,
        updatedAt: new Date(),
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    res.json({ customer: toPlain(updated) });
  })
);

customersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const existing = await prisma.customer.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null }
    });

    if (!existing) {
      throw new HttpError(404, "Customer not found");
    }

    const deleted = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    res.json({ customer: toPlain(deleted) });
  })
);
