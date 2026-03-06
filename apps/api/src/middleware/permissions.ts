import { NextFunction, Request, Response } from "express";
import type { AuthTokenPayload } from "../lib/token";

export type AppPermission =
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
  | "backup.manage";

const ownerPermissions: AppPermission[] = [
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
  "backup.manage"
];

const managerPermissions: AppPermission[] = [
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
  "backup.manage"
];

const cashierPermissions: AppPermission[] = [
  "products.read",
  "customers.read",
  "orders.read",
  "orders.write",
  "payments.read",
  "payments.write",
  "reports.read"
];

const rolePermissions: Record<AuthTokenPayload["role"], Set<AppPermission>> = {
  OWNER: new Set(ownerPermissions),
  MANAGER: new Set(managerPermissions),
  CASHIER: new Set(cashierPermissions)
};

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
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!hasPermission(req.user.role, permission)) {
      res.status(403).json({ message: "Forbidden: missing permission" });
      return;
    }

    next();
  };
}
