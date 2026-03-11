import { NextFunction, Request, Response } from "express";
import type { AuthTokenPayload } from "../lib/token";
import { prisma } from "../lib/prisma";

export type AppPermission =
  | "discounts.override"
  | "sales.void"
  | "products.read"
  | "products.write"
  | "customers.read"
  | "customers.write"
  | "orders.read"
  | "orders.write"
  | "orders.manage"
  | "payments.read"
  | "payments.write"
  | "inventory.read"
  | "inventory.write"
  | "reports.read"
  | "settings.read"
  | "settings.write"
  | "staff.read"
  | "staff.manage"
  | "devices.read"
  | "devices.manage"
  | "backup.manage"
  | "branches.read"
  | "branches.manage"
  | "transfers.read"
  | "transfers.write"
  | "catalog.read"
  | "catalog.write"
  | "deliveries.read"
  | "deliveries.manage"
  | "suppliers.read"
  | "suppliers.write"
  | "purchases.read"
  | "purchases.write"
  | "expenses.read"
  | "expenses.write"
  | "stocktakes.read"
  | "stocktakes.write"
  | "stocktakes.manage"
  | "cashups.read"
  | "cashups.write"
  | "cashups.manage"
  | "notifications.read"
  | "notifications.manage"
  | "pricing.read"
  | "pricing.manage"
  | "admin.access"
  | "billing.manage";

const rolePermissions: Record<AuthTokenPayload["role"], Set<AppPermission>> = {
  OWNER: new Set([
    "discounts.override",
    "sales.void",
    "products.read",
    "products.write",
    "customers.read",
    "customers.write",
    "orders.read",
    "orders.write",
    "orders.manage",
    "payments.read",
    "payments.write",
    "inventory.read",
    "inventory.write",
    "reports.read",
    "settings.read",
    "settings.write",
    "staff.read",
    "staff.manage",
    "devices.read",
    "devices.manage",
    "backup.manage",
    "branches.read",
    "branches.manage",
    "transfers.read",
    "transfers.write",
    "catalog.read",
    "catalog.write",
    "deliveries.read",
    "deliveries.manage",
    "suppliers.read",
    "suppliers.write",
    "purchases.read",
    "purchases.write",
    "expenses.read",
    "expenses.write",
    "stocktakes.read",
    "stocktakes.write",
    "stocktakes.manage",
    "cashups.read",
    "cashups.write",
    "cashups.manage",
    "notifications.read",
    "notifications.manage",
    "pricing.read",
    "pricing.manage",
    "admin.access",
    "billing.manage"
  ]),
  ADMIN: new Set([
    "discounts.override",
    "sales.void",
    "products.read",
    "products.write",
    "customers.read",
    "customers.write",
    "orders.read",
    "orders.write",
    "orders.manage",
    "payments.read",
    "payments.write",
    "inventory.read",
    "inventory.write",
    "reports.read",
    "settings.read",
    "settings.write",
    "staff.read",
    "staff.manage",
    "devices.read",
    "devices.manage",
    "backup.manage",
    "branches.read",
    "branches.manage",
    "transfers.read",
    "transfers.write",
    "catalog.read",
    "catalog.write",
    "deliveries.read",
    "deliveries.manage",
    "suppliers.read",
    "suppliers.write",
    "purchases.read",
    "purchases.write",
    "expenses.read",
    "expenses.write",
    "stocktakes.read",
    "stocktakes.write",
    "stocktakes.manage",
    "cashups.read",
    "cashups.write",
    "cashups.manage",
    "notifications.read",
    "notifications.manage",
    "pricing.read",
    "admin.access"
  ]),
  MANAGER: new Set([
    "discounts.override",
    "sales.void",
    "products.read",
    "products.write",
    "customers.read",
    "customers.write",
    "orders.read",
    "orders.write",
    "orders.manage",
    "payments.read",
    "payments.write",
    "inventory.read",
    "inventory.write",
    "reports.read",
    "settings.read",
    "settings.write",
    "staff.read",
    "devices.read",
    "devices.manage",
    "backup.manage",
    "branches.read",
    "transfers.read",
    "transfers.write",
    "catalog.read",
    "catalog.write",
    "deliveries.read",
    "deliveries.manage",
    "suppliers.read",
    "suppliers.write",
    "purchases.read",
    "purchases.write",
    "expenses.read",
    "expenses.write",
    "stocktakes.read",
    "stocktakes.write",
    "stocktakes.manage",
    "cashups.read",
    "cashups.write",
    "cashups.manage",
    "notifications.read",
    "pricing.read"
  ]),
  CASHIER: new Set([
    "products.read",
    "products.write",
    "customers.read",
    "orders.read",
    "orders.write",
    "orders.manage",
    "payments.read",
    "payments.write",
    "reports.read",
    "branches.read",
    "catalog.read",
    "expenses.read",
    "expenses.write",
    "cashups.read",
    "cashups.write",
    "notifications.read"
  ]),
  STOCK_CONTROLLER: new Set([
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.write",
    "transfers.read",
    "transfers.write",
    "branches.read",
    "reports.read",
    "suppliers.read",
    "purchases.read",
    "purchases.write",
    "expenses.read",
    "stocktakes.read",
    "stocktakes.write",
    "notifications.read"
  ]),
  DELIVERY_RIDER: new Set(["deliveries.read", "deliveries.manage", "notifications.read"])
};

const subscriptionGuardPermissions = new Set<AppPermission>([
  "products.write",
  "customers.write",
  "orders.write",
  "orders.manage",
  "payments.write",
  "inventory.write",
  "settings.write",
  "branches.manage",
  "transfers.write",
  "catalog.write",
  "deliveries.manage",
  "suppliers.write",
  "purchases.write",
  "expenses.write",
  "stocktakes.write",
  "stocktakes.manage",
  "cashups.write",
  "cashups.manage"
]);

export function hasPermission(role: AuthTokenPayload["role"], permission: AppPermission): boolean {
  return rolePermissions[role]?.has(permission) ?? false;
}

export function requireRole(roles: AuthTokenPayload["role"][]) {
  const allowed = new Set<AuthTokenPayload["role"]>(roles);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!allowed.has(req.user.role)) {
      res.status(403).json({ message: "Forbidden: insufficient role" });
      return;
    }

    next();
  };
}

export function requirePermission(permission: AppPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!hasPermission(req.user.role, permission)) {
      res.status(403).json({ message: "Forbidden: missing permission" });
      return;
    }

    if (subscriptionGuardPermissions.has(permission)) {
      const subscription = await prisma.subscription.findFirst({
        where: { merchantId: req.user.merchantId },
        include: { plan: true },
        orderBy: { updatedAt: "desc" }
      });
      const now = Date.now();
      const isActive =
        subscription?.status === "ACTIVE" ||
        (subscription?.status === "TRIALING" && new Date(subscription.billingPeriodEnd).getTime() >= now);

      if (!isActive) {
        res.status(403).json({
          message: "Trial expired. Activate your account to continue creating or editing records.",
          code: "TRIAL_EXPIRED"
        });
        return;
      }
    }

    next();
  };
}

export function requirePlatformAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!req.user.platformAccess) {
    res.status(403).json({ message: "Forbidden: platform access required" });
    return;
  }

  next();
}
