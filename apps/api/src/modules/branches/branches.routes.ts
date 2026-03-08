import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { signToken } from "../../lib/token";
import { recordAudit } from "../audit/audit.service";
import { assertPlanLimit } from "../platform/platform.service";

const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(30).optional()
});

const selectBranchSchema = z.object({
  branchId: z.string().uuid()
});

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const branchesRouter = Router();
branchesRouter.use(requireAuth);

branchesRouter.get(
  "/",
  requirePermission("branches.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const branches = await prisma.branch.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });

    const stocks = await prisma.productStock.groupBy({
      by: ["branchId"],
      where: { merchantId, deletedAt: null },
      _count: { _all: true }
    });

    const byBranch = new Map(stocks.map((item) => [item.branchId, item._count._all]));

    res.json({
      branches: toPlain(
        branches.map((branch) => ({
          ...branch,
          stockLines: byBranch.get(branch.id) ?? 0,
          isActive: branch.id === req.user!.branchId
        }))
      )
    });
  })
);

branchesRouter.post(
  "/",
  requirePermission("branches.manage"),
  validateBody(branchSchema),
  asyncHandler(async (req, res) => {
    await assertPlanLimit(prisma, req.user!.merchantId, "branches");
    const body = req.body as z.infer<typeof branchSchema>;
    const now = new Date();

    const branch = await prisma.branch.create({
      data: {
        id: randomUUID(),
        merchantId: req.user!.merchantId,
        name: body.name,
        address: body.address ?? null,
        phone: body.phone ?? null,
        isDefault: false,
        createdAt: now,
        updatedAt: now
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "branch.create",
      entityType: "Branch",
      entityId: branch.id
    });

    res.status(201).json({ branch: toPlain(branch) });
  })
);

branchesRouter.put(
  "/:id",
  requirePermission("branches.manage"),
  validateBody(branchSchema.partial()),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const existing = await prisma.branch.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null }
    });

    if (!existing) {
      throw new HttpError(404, "Branch not found");
    }

    const body = req.body as Partial<z.infer<typeof branchSchema>>;
    const branch = await prisma.branch.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        address: body.address ?? existing.address,
        phone: body.phone ?? existing.phone,
        updatedAt: new Date()
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "branch.update",
      entityType: "Branch",
      entityId: branch.id
    });

    res.json({ branch: toPlain(branch) });
  })
);

branchesRouter.post(
  "/select",
  validateBody(selectBranchSchema),
  asyncHandler(async (req, res) => {
    const { branchId } = req.body as z.infer<typeof selectBranchSchema>;
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!branch) {
      throw new HttpError(404, "Branch not found");
    }

    await prisma.device.updateMany({
      where: {
        merchantId: req.user!.merchantId,
        userId: req.user!.userId,
        deviceId: req.user!.deviceId,
        deletedAt: null,
        revokedAt: null
      },
      data: {
        activeBranchId: branch.id,
        updatedAt: new Date()
      }
    });

    const token = signToken({
      ...req.user!,
      branchId: branch.id,
      platformAccess: req.user!.platformAccess
    });

    await recordAudit(prisma, req.user!, {
      action: "branch.select",
      entityType: "Branch",
      entityId: branch.id
    });

    res.json({ branch: toPlain(branch), token, activeBranchId: branch.id });
  })
);
