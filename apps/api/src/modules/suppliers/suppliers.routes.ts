import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { recordAudit } from "../audit/audit.service";

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  notes: z.string().trim().max(500).optional(),
  branchId: z.string().uuid().nullable().optional()
});

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

suppliersRouter.get(
  "/",
  requirePermission("suppliers.read"),
  asyncHandler(async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null
      },
      orderBy: [{ updatedAt: "desc" }]
    });

    res.json({ suppliers: toPlain(suppliers) });
  })
);

suppliersRouter.post(
  "/",
  requirePermission("suppliers.write"),
  validateBody(supplierSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof supplierSchema>;
    const now = new Date();
    const supplier = await prisma.supplier.create({
      data: {
        merchantId: req.user!.merchantId,
        branchId: body.branchId ?? req.user!.branchId ?? null,
        createdByUserId: req.user!.userId,
        updatedByUserId: req.user!.userId,
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "supplier.create",
      entityType: "Supplier",
      entityId: supplier.id,
      metadata: { name: supplier.name }
    });

    res.status(201).json({ supplier: toPlain(supplier) });
  })
);

suppliersRouter.put(
  "/:id",
  requirePermission("suppliers.write"),
  validateBody(supplierSchema.partial().refine((value) => Object.keys(value).length > 0, "No changes supplied")),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!supplier) {
      throw new HttpError(404, "Supplier not found");
    }

    const body = req.body as z.infer<typeof supplierSchema>;
    const updated = await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        name: body.name ?? supplier.name,
        phone: body.phone ?? supplier.phone,
        email: body.email ?? supplier.email,
        notes: body.notes ?? supplier.notes,
        branchId: body.branchId !== undefined ? body.branchId : supplier.branchId,
        updatedByUserId: req.user!.userId,
        updatedAt: new Date(),
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "supplier.update",
      entityType: "Supplier",
      entityId: updated.id
    });

    res.json({ supplier: toPlain(updated) });
  })
);

suppliersRouter.delete(
  "/:id",
  requirePermission("suppliers.write"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!supplier) {
      throw new HttpError(404, "Supplier not found");
    }

    const deleted = await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedByUserId: req.user!.userId,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "supplier.delete",
      entityType: "Supplier",
      entityId: deleted.id
    });

    res.json({ supplier: toPlain(deleted) });
  })
);
