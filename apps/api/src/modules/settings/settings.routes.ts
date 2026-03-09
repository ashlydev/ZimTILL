import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { RoleType } from "@prisma/client";
import { identifierSchema, pinSchema } from "@novoriq/shared";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission, requireRole } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { recordAudit } from "../audit/audit.service";
import { syncLegacyUserAuth } from "../auth/auth.service";
import { assertPlanLimit } from "../platform/platform.service";

const settingsUpdateSchema = z.object({
  businessName: z.string().trim().min(2).max(120).optional(),
  currencyCode: z.enum(["USD", "ZWL"]).optional(),
  currencySymbol: z.string().trim().min(1).max(5).optional(),
  paymentInstructions: z.string().trim().max(500).optional(),
  whatsappTemplate: z.string().trim().max(1000).optional(),
  supportPhone: z.string().trim().max(30).nullable().optional(),
  supportEmail: z.string().trim().email().nullable().optional()
});

const createStaffSchema = z.object({
  identifier: identifierSchema,
  pin: pinSchema,
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "CASHIER", "STOCK_CONTROLLER", "DELIVERY_RIDER"]).default("CASHIER")
});

const updateStaffRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "CASHIER", "STOCK_CONTROLLER", "DELIVERY_RIDER"])
});

const resetStaffPinSchema = z.object({
  pin: pinSchema
});

const backupImportSchema = z.object({
  backup: z.record(z.any())
});

type SettingsPayload = z.infer<typeof settingsUpdateSchema>;

type RoleClient = Pick<typeof prisma, "role">;

async function ensureRoleRecord(tx: RoleClient, merchantId: string, role: RoleType) {
  const name = role.charAt(0) + role.slice(1).toLowerCase();
  return tx.role.upsert({
    where: {
      merchantId_key: {
        merchantId,
        key: role
      }
    },
    create: {
      id: randomUUID(),
      merchantId,
      key: role,
      name,
      description: `${name} role`
    },
    update: {
      name,
      description: `${name} role`,
      updatedAt: new Date(),
      deletedAt: null
    }
  });
}

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  "/",
  requirePermission("settings.read"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const settings = await prisma.settings.findFirst({ where: { merchantId, deletedAt: null } });

    if (!settings) {
      const now = new Date();
      const created = await prisma.settings.create({
        data: {
          id: randomUUID(),
          merchantId,
          createdByUserId: req.user!.userId,
          updatedByUserId: req.user!.userId,
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
  requirePermission("settings.write"),
  validateBody(settingsUpdateSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const body = req.body as SettingsPayload;
    const existing = await prisma.settings.findFirst({ where: { merchantId, deletedAt: null } });

    const now = new Date();
    const updated = existing
      ? await prisma.settings.update({
          where: { id: existing.id },
          data: {
            ...body,
            updatedAt: now,
            updatedByUserId: req.user!.userId,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        })
      : await prisma.settings.create({
          data: {
            id: randomUUID(),
            merchantId,
            createdByUserId: req.user!.userId,
            updatedByUserId: req.user!.userId,
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

    await recordAudit(prisma, req.user!, {
      action: "settings.update",
      entityType: "Settings",
      entityId: updated.id
    });

    res.json({ settings: toPlain(updated) });
  })
);

settingsRouter.get(
  "/staff",
  requirePermission("staff.read"),
  asyncHandler(async (req, res) => {
    const staff = await prisma.user.findMany({
      where: { merchantId: req.user!.merchantId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });

    const devices = await prisma.device.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null,
        revokedAt: null
      }
    });

    const byUser = new Map<string, { count: number; lastSeenAt: Date | null }>();
    for (const device of devices) {
      const current = byUser.get(device.userId) ?? { count: 0, lastSeenAt: null };
      current.count += 1;
      if (!current.lastSeenAt || current.lastSeenAt < device.lastSeenAt) {
        current.lastSeenAt = device.lastSeenAt;
      }
      byUser.set(device.userId, current);
    }

    res.json({
      staff: toPlain(
        staff.map((user) => {
          const stats = byUser.get(user.id);
          return {
            ...user,
            activeDevices: stats?.count ?? 0,
            lastSeenAt: stats?.lastSeenAt ?? null
          };
        })
      )
    });
  })
);

settingsRouter.post(
  "/staff",
  requireRole(["OWNER", "ADMIN"]),
  validateBody(createStaffSchema),
  asyncHandler(async (req, res) => {
    await assertPlanLimit(prisma, req.user!.merchantId, "users");
    const body = req.body as z.infer<typeof createStaffSchema>;
    const merchantId = req.user!.merchantId;

    const existing = await prisma.user.findFirst({
      where: {
        identifier: body.identifier,
        deletedAt: null
      }
    });

    if (existing) {
      throw new HttpError(409, "Identifier is already registered");
    }

    const now = new Date();
    const pinHash = await bcrypt.hash(body.pin, 10);

    const created = await prisma.$transaction(async (tx) => {
      const roleModel = await ensureRoleRecord(tx as unknown as RoleClient, merchantId, body.role as RoleType);
      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          merchantId,
          roleId: roleModel.id,
          defaultBranchId: req.user!.branchId ?? null,
          identifier: body.identifier,
          pinHash,
          role: body.role as RoleType,
          isActive: true,
          createdAt: now,
          updatedAt: now
        }
      });

      await syncLegacyUserAuth(tx, {
        merchantId,
        userId: user.id,
        identifier: user.identifier,
        pinHash
      });

      return user;
    });

    await recordAudit(prisma, req.user!, {
      action: "staff.create",
      entityType: "User",
      entityId: created.id,
      metadata: { role: created.role }
    });

    res.status(201).json({ user: toPlain(created) });
  })
);

settingsRouter.put(
  "/staff/:id/role",
  requireRole(["OWNER", "ADMIN"]),
  validateBody(updateStaffRoleSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const body = req.body as z.infer<typeof updateStaffRoleSchema>;

    if (id === req.user!.userId && body.role !== "OWNER") {
      throw new HttpError(400, "Owner cannot remove own OWNER role");
    }

    const target = await prisma.user.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!target) {
      throw new HttpError(404, "Staff account not found");
    }

    const roleModel = await ensureRoleRecord(prisma as unknown as RoleClient, req.user!.merchantId, body.role as RoleType);

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        role: body.role as RoleType,
        roleId: roleModel.id,
        updatedAt: new Date()
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "staff.updateRole",
      entityType: "User",
      entityId: updated.id,
      metadata: { role: updated.role }
    });

    res.json({ user: toPlain(updated) });
  })
);

settingsRouter.post(
  "/staff/:id/reset-pin",
  requireRole(["OWNER", "ADMIN"]),
  validateBody(resetStaffPinSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const body = req.body as z.infer<typeof resetStaffPinSchema>;

    const target = await prisma.user.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!target) {
      throw new HttpError(404, "Staff account not found");
    }

    const pinHash = await bcrypt.hash(body.pin, 10);

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        pinHash,
        updatedAt: new Date()
      }
    });

    await syncLegacyUserAuth(prisma, {
      merchantId: updated.merchantId,
      userId: updated.id,
      identifier: updated.identifier,
      pinHash
    });

    await recordAudit(prisma, req.user!, {
      action: "staff.resetPin",
      entityType: "User",
      entityId: updated.id
    });

    res.json({ success: true });
  })
);

settingsRouter.post(
  "/staff/:id/deactivate",
  requireRole(["OWNER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);

    if (id === req.user!.userId) {
      throw new HttpError(400, "Owner cannot deactivate own account");
    }

    const target = await prisma.user.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!target) {
      throw new HttpError(404, "Staff account not found");
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: {
          isActive: false,
          updatedAt: new Date()
        }
      });

      await tx.device.updateMany({
        where: {
          merchantId: req.user!.merchantId,
          userId: target.id,
          revokedAt: null
        },
        data: {
          revokedAt: new Date(),
          updatedAt: new Date()
        }
      });
    });

    await recordAudit(prisma, req.user!, {
      action: "staff.deactivate",
      entityType: "User",
      entityId: target.id
    });

    res.json({ success: true });
  })
);

settingsRouter.post(
  "/staff/:id/reactivate",
  requireRole(["OWNER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);

    const target = await prisma.user.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!target) {
      throw new HttpError(404, "Staff account not found");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: true,
        updatedAt: new Date()
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "staff.reactivate",
      entityType: "User",
      entityId: updated.id
    });

    res.json({ user: toPlain(updated) });
  })
);

settingsRouter.get(
  "/devices",
  requirePermission("devices.read"),
  asyncHandler(async (req, res) => {
    const devices = await prisma.device.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null
      },
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

settingsRouter.post(
  "/devices/:id/revoke",
  requirePermission("devices.manage"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const device = await prisma.device.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!device) {
      throw new HttpError(404, "Device not found");
    }

    const revoked = await prisma.device.update({
      where: { id: device.id },
      data: {
        revokedAt: new Date(),
        updatedAt: new Date()
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "device.revoke",
      entityType: "Device",
      entityId: revoked.id,
      metadata: { deviceId: revoked.deviceId }
    });

    res.json({ device: toPlain(revoked) });
  })
);

settingsRouter.get(
  "/backup/export",
  requirePermission("backup.manage"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;

    const [merchant, settings, categories, products, customers, orders, orderItems, payments, stockMovements] = await Promise.all([
      prisma.merchant.findUnique({ where: { id: merchantId } }),
      prisma.settings.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.category.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.product.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.customer.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.order.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.orderItem.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.payment.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } }),
      prisma.stockMovement.findMany({ where: { merchantId, deletedAt: null }, orderBy: { updatedAt: "asc" } })
    ]);

    const backup = {
      version: "2.0.0",
      exportedAt: new Date().toISOString(),
      merchant: toPlain(merchant),
      data: toPlain({
        settings,
        categories,
        products,
        customers,
        orders,
        orderItems,
        payments,
        stockMovements
      })
    };

    await recordAudit(prisma, req.user!, {
      action: "backup.export",
      entityType: "Merchant",
      entityId: merchantId,
      metadata: {
        counts: {
          categories: categories.length,
          products: products.length,
          customers: customers.length,
          orders: orders.length,
          orderItems: orderItems.length,
          payments: payments.length,
          stockMovements: stockMovements.length
        }
      }
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=novoriq-backup-${merchantId}-${Date.now()}.json`);
    res.json(backup);
  })
);

settingsRouter.post(
  "/backup/import",
  requirePermission("backup.manage"),
  validateBody(backupImportSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const payload = req.body as z.infer<typeof backupImportSchema>;

    const backup = payload.backup;
    const data = (backup.data ?? backup) as Record<string, unknown>;

    const settingsRows = Array.isArray(data.settings) ? data.settings : [];
    const categoriesRows = Array.isArray(data.categories) ? data.categories : [];
    const productsRows = Array.isArray(data.products) ? data.products : [];
    const customersRows = Array.isArray(data.customers) ? data.customers : [];
    const ordersRows = Array.isArray(data.orders) ? data.orders : [];
    const orderItemsRows = Array.isArray(data.orderItems) ? data.orderItems : [];
    const paymentsRows = Array.isArray(data.payments) ? data.payments : [];
    const stockMovementsRows = Array.isArray(data.stockMovements) ? data.stockMovements : [];

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const row of settingsRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();

        const existing = await tx.settings.findFirst({
          where: {
            merchantId,
            deletedAt: null
          }
        });

        if (existing) {
          await tx.settings.update({
            where: { id: existing.id },
            data: {
              businessName: toNullableString(record.businessName) ?? existing.businessName,
              currencyCode: (record.currencyCode === "ZWL" ? "ZWL" : "USD") as "USD" | "ZWL",
              currencySymbol: toNullableString(record.currencySymbol) ?? existing.currencySymbol,
              paymentInstructions: toNullableString(record.paymentInstructions) ?? existing.paymentInstructions,
              whatsappTemplate: toNullableString(record.whatsappTemplate) ?? existing.whatsappTemplate,
              supportPhone: toNullableString(record.supportPhone),
              supportEmail: toNullableString(record.supportEmail),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });
        } else {
          await tx.settings.create({
            data: {
              id,
              merchantId,
              businessName: toNullableString(record.businessName) ?? "My Business",
              currencyCode: record.currencyCode === "ZWL" ? "ZWL" : "USD",
              currencySymbol: toNullableString(record.currencySymbol) ?? "$",
              paymentInstructions: toNullableString(record.paymentInstructions) ?? "EcoCash / ZIPIT / Bank transfer / Cash",
              whatsappTemplate:
                toNullableString(record.whatsappTemplate) ??
                "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.",
              supportPhone: toNullableString(record.supportPhone),
              supportEmail: toNullableString(record.supportEmail),
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of categoriesRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();

        const existingById = await tx.category.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        if (existingById) {
          await tx.category.update({
            where: { id: existingById.id },
            data: {
              name: toNullableString(record.name) ?? existingById.name,
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.category.create({
            data: {
              id,
              merchantId,
              name: toNullableString(record.name) ?? "Imported Category",
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of productsRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();
        const categoryId = toNullableString(record.categoryId);

        const existingById = await tx.product.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        if (existingById) {
          await tx.product.update({
            where: { id: existingById.id },
            data: {
              name: toNullableString(record.name) ?? existingById.name,
              price: toNumber(record.price, Number(existingById.price)),
              cost: record.cost == null ? null : toNumber(record.cost),
              sku: toNullableString(record.sku),
              categoryId,
              category: toNullableString(record.category),
              stockQty: toNumber(record.stockQty, Number(existingById.stockQty)),
              lowStockThreshold: toNumber(record.lowStockThreshold, Number(existingById.lowStockThreshold)),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.product.create({
            data: {
              id,
              merchantId,
              name: toNullableString(record.name) ?? "Imported Product",
              price: toNumber(record.price),
              cost: record.cost == null ? null : toNumber(record.cost),
              sku: toNullableString(record.sku),
              categoryId,
              category: toNullableString(record.category),
              stockQty: toNumber(record.stockQty),
              lowStockThreshold: toNumber(record.lowStockThreshold, 0),
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of customersRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();

        const existingById = await tx.customer.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        if (existingById) {
          await tx.customer.update({
            where: { id: existingById.id },
            data: {
              name: toNullableString(record.name) ?? existingById.name,
              phone: toNullableString(record.phone),
              notes: toNullableString(record.notes),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.customer.create({
            data: {
              id,
              merchantId,
              name: toNullableString(record.name) ?? "Imported Customer",
              phone: toNullableString(record.phone),
              notes: toNullableString(record.notes),
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of ordersRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();

        const existingById = await tx.order.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        const customerId = typeof record.customerId === "string" ? record.customerId : null;
        const customer = customerId ? await tx.customer.findFirst({ where: { id: customerId, merchantId, deletedAt: null } }) : null;

        if (existingById) {
          await tx.order.update({
            where: { id: existingById.id },
            data: {
              customerId: customer ? customer.id : null,
              orderNumber: toNullableString(record.orderNumber) ?? existingById.orderNumber,
              status: ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(String(record.status))
                ? (String(record.status) as any)
                : existingById.status,
              subtotal: toNumber(record.subtotal, Number(existingById.subtotal)),
              discountAmount: toNumber(record.discountAmount, Number(existingById.discountAmount)),
              discountPercent: toNumber(record.discountPercent, Number(existingById.discountPercent)),
              total: toNumber(record.total, Number(existingById.total)),
              notes: toNullableString(record.notes),
              confirmedAt: record.confirmedAt ? toDate(record.confirmedAt, now) : null,
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.order.create({
            data: {
              id,
              merchantId,
              customerId: customer ? customer.id : null,
              orderNumber: toNullableString(record.orderNumber) ?? `IMP-${Date.now()}`,
              status: ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(String(record.status))
                ? (String(record.status) as any)
                : "DRAFT",
              subtotal: toNumber(record.subtotal),
              discountAmount: toNumber(record.discountAmount),
              discountPercent: toNumber(record.discountPercent),
              total: toNumber(record.total),
              notes: toNullableString(record.notes),
              confirmedAt: record.confirmedAt ? toDate(record.confirmedAt, now) : null,
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of orderItemsRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();
        const orderId = typeof record.orderId === "string" ? record.orderId : "";
        const productId = typeof record.productId === "string" ? record.productId : "";

        if (!orderId || !productId) continue;

        const [order, product] = await Promise.all([
          tx.order.findFirst({ where: { id: orderId, merchantId, deletedAt: null } }),
          tx.product.findFirst({ where: { id: productId, merchantId, deletedAt: null } })
        ]);

        if (!order || !product) continue;

        const existingById = await tx.orderItem.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        if (existingById) {
          await tx.orderItem.update({
            where: { id: existingById.id },
            data: {
              orderId: order.id,
              productId: product.id,
              quantity: toNumber(record.quantity, Number(existingById.quantity)),
              unitPrice: toNumber(record.unitPrice, Number(existingById.unitPrice)),
              lineTotal: toNumber(record.lineTotal, Number(existingById.lineTotal)),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.orderItem.create({
            data: {
              id,
              merchantId,
              orderId: order.id,
              productId: product.id,
              quantity: toNumber(record.quantity, 1),
              unitPrice: toNumber(record.unitPrice),
              lineTotal: toNumber(record.lineTotal),
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of paymentsRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();
        const orderId = typeof record.orderId === "string" ? record.orderId : "";

        if (!orderId) continue;
        const order = await tx.order.findFirst({ where: { id: orderId, merchantId, deletedAt: null } });
        if (!order) continue;

        const existingById = await tx.payment.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        const method = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER", "PAYNOW"].includes(String(record.method))
          ? (String(record.method) as any)
          : "CASH";
        const status = ["PENDING", "CONFIRMED"].includes(String(record.status)) ? (String(record.status) as any) : "CONFIRMED";

        if (existingById) {
          await tx.payment.update({
            where: { id: existingById.id },
            data: {
              orderId: order.id,
              amount: toNumber(record.amount, Number(existingById.amount)),
              method,
              reference: toNullableString(record.reference),
              paidAt: toDate(record.paidAt, existingById.paidAt),
              status,
              paynowTransactionId: toNullableString(record.paynowTransactionId),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.payment.create({
            data: {
              id,
              merchantId,
              orderId: order.id,
              amount: toNumber(record.amount),
              method,
              reference: toNullableString(record.reference),
              paidAt: toDate(record.paidAt, now),
              status,
              paynowTransactionId: toNullableString(record.paynowTransactionId),
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }

      for (const row of stockMovementsRows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : randomUUID();
        const productId = typeof record.productId === "string" ? record.productId : "";
        const orderId = typeof record.orderId === "string" ? record.orderId : null;

        if (!productId) continue;

        const product = await tx.product.findFirst({ where: { id: productId, merchantId, deletedAt: null } });
        if (!product) continue;

        const order = orderId ? await tx.order.findFirst({ where: { id: orderId, merchantId, deletedAt: null } }) : null;

        const existingById = await tx.stockMovement.findUnique({ where: { id } });
        if (existingById && existingById.merchantId !== merchantId) continue;

        const type = ["IN", "OUT", "ADJUSTMENT"].includes(String(record.type)) ? (String(record.type) as any) : "ADJUSTMENT";

        if (existingById) {
          await tx.stockMovement.update({
            where: { id: existingById.id },
            data: {
              productId: product.id,
              type,
              quantity: toNumber(record.quantity, Number(existingById.quantity)),
              reason: toNullableString(record.reason),
              orderId: order ? order.id : null,
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId,
              deletedAt: null
            }
          });
        } else {
          await tx.stockMovement.create({
            data: {
              id,
              merchantId,
              productId: product.id,
              type,
              quantity: toNumber(record.quantity),
              reason: toNullableString(record.reason),
              orderId: order ? order.id : null,
              createdAt: toDate(record.createdAt, now),
              updatedAt: toDate(record.updatedAt, now),
              version: Math.max(1, Math.floor(toNumber(record.version, 1))),
              lastModifiedByDeviceId: toNullableString(record.lastModifiedByDeviceId) ?? req.user!.deviceId,
              deletedAt: null
            }
          });
        }
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "backup.import",
      entityType: "Merchant",
      entityId: merchantId,
      metadata: {
        importedAt: new Date().toISOString(),
        counts: {
          settings: settingsRows.length,
          products: productsRows.length,
          customers: customersRows.length,
          orders: ordersRows.length,
          orderItems: orderItemsRows.length,
          payments: paymentsRows.length,
          stockMovements: stockMovementsRows.length
        }
      }
    });

    res.json({
      success: true,
      imported: {
        settings: settingsRows.length,
        products: productsRows.length,
        customers: customersRows.length,
        orders: ordersRows.length,
        orderItems: orderItemsRows.length,
        payments: paymentsRows.length,
        stockMovements: stockMovementsRows.length
      }
    });
  })
);
