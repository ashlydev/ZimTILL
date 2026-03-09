import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { recordAudit } from "../audit/audit.service";

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

const categoryUpdateSchema = categoryCreateSchema.partial();

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function ensureUniqueName(merchantId: string, name: string, excludeId?: string) {
  const existing = await prisma.category.findFirst({
    where: {
      merchantId,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      name: { equals: name, mode: "insensitive" }
    }
  });

  if (existing) {
    throw new HttpError(409, "A category with that name already exists", "CATEGORY_EXISTS");
  }
}

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  requirePermission("products.read"),
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null
      },
      orderBy: [{ name: "asc" }]
    });

    res.json({ categories: toPlain(categories) });
  })
);

categoriesRouter.post(
  "/",
  requirePermission("products.write"),
  validateBody(categoryCreateSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const body = req.body as z.infer<typeof categoryCreateSchema>;
    const now = new Date();

    await ensureUniqueName(merchantId, body.name);

    const category = await prisma.category.create({
      data: {
        id: randomUUID(),
        merchantId,
        createdByUserId: req.user!.userId,
        updatedByUserId: req.user!.userId,
        name: body.name,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "category.create",
      entityType: "Category",
      entityId: category.id
    });

    res.status(201).json({ category: toPlain(category) });
  })
);

categoriesRouter.patch(
  "/:id",
  requirePermission("products.write"),
  validateBody(categoryUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const body = req.body as z.infer<typeof categoryUpdateSchema>;
    const existing = await prisma.category.findFirst({
      where: { id, merchantId, deletedAt: null }
    });

    if (!existing) {
      throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    const nextName = body.name?.trim() || existing.name;
    if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
      await ensureUniqueName(merchantId, nextName, existing.id);
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      await tx.product.updateMany({
        where: {
          merchantId,
          categoryId: existing.id,
          deletedAt: null
        },
        data: {
          category: nextName,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      return category;
    });

    await recordAudit(prisma, req.user!, {
      action: "category.update",
      entityType: "Category",
      entityId: updated.id
    });

    res.json({ category: toPlain(updated) });
  })
);

categoriesRouter.delete(
  "/:id",
  requirePermission("products.write"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const existing = await prisma.category.findFirst({
      where: { id, merchantId, deletedAt: null }
    });

    if (!existing) {
      throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    const now = new Date();
    const deleted = await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id: existing.id },
        data: {
          deletedAt: now,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      await tx.product.updateMany({
        where: {
          merchantId,
          categoryId: existing.id,
          deletedAt: null
        },
        data: {
          categoryId: null,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      return category;
    });

    await recordAudit(prisma, req.user!, {
      action: "category.delete",
      entityType: "Category",
      entityId: deleted.id
    });

    res.json({ category: toPlain(deleted) });
  })
);
