import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { toPlain } from "../../lib/serialization";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";

export const v2Router = Router();
v2Router.use(requireAuth);

v2Router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({
      version: "v2",
      features: [
        "staffAccounts",
        "rolePermissions",
        "multiDeviceManagement",
        "backupRestore",
        "paynowStatusUX"
      ]
    });
  })
);

v2Router.get(
  "/staff",
  requirePermission("staff.read"),
  asyncHandler(async (req, res) => {
    const staff = await prisma.user.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      select: {
        id: true,
        identifier: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    });

    res.json({ staff: toPlain(staff) });
  })
);

v2Router.get(
  "/devices",
  requirePermission("devices.read"),
  asyncHandler(async (req, res) => {
    const devices = await prisma.device.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            identifier: true,
            role: true,
            isActive: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ devices: toPlain(devices) });
  })
);

v2Router.get(
  "/backup/status",
  requirePermission("backup.manage"),
  asyncHandler(async (_req, res) => {
    res.json({
      localBackup: true,
      importMode: "merge",
      cloudBackup: "planned"
    });
  })
);
