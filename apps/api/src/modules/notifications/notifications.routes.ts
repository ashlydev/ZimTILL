import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";

const listQuerySchema = z.object({
  type: z.string().trim().optional(),
  branchId: z.string().uuid().optional()
});

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

notificationsRouter.get(
  "/",
  requirePermission("notifications.read"),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const isManagement = ["OWNER", "ADMIN", "MANAGER"].includes(req.user!.role);
    const notifications = await prisma.appNotification.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null,
        ...(query.type ? { type: query.type as any } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(isManagement
          ? {}
          : {
              OR: [{ visibility: "ALL_STAFF" }, { userId: req.user!.userId }]
            })
      },
      orderBy: { createdAt: "desc" }
    });

    const unreadCount = notifications.filter((item) => !item.isRead).length;
    res.json({ notifications: toPlain(notifications), unreadCount });
  })
);

notificationsRouter.post(
  "/:id/read",
  requirePermission("notifications.read"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const notification = await prisma.appNotification.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!notification) {
      throw new HttpError(404, "Notification not found");
    }

    const updated = await prisma.appNotification.update({
      where: { id: notification.id },
      data: {
        isRead: true,
        updatedAt: new Date()
      }
    });

    res.json({ notification: toPlain(updated) });
  })
);

notificationsRouter.post(
  "/mark-all-read",
  requirePermission("notifications.read"),
  validateBody(z.object({ branchId: z.string().uuid().optional() })),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { branchId?: string };
    const isManagement = ["OWNER", "ADMIN", "MANAGER"].includes(req.user!.role);
    await prisma.appNotification.updateMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null,
        isRead: false,
        ...(body.branchId ? { branchId: body.branchId } : {}),
        ...(isManagement
          ? {}
          : {
              OR: [{ visibility: "ALL_STAFF" }, { userId: req.user!.userId }]
            })
      },
      data: {
        isRead: true,
        updatedAt: new Date()
      }
    });

    res.json({ success: true });
  })
);
