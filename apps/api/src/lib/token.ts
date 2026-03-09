import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type MerchantAuthTokenPayload = {
  userId: string;
  merchantId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "STOCK_CONTROLLER" | "DELIVERY_RIDER";
  identifier: string;
  deviceId: string;
  branchId: string | null;
  platformAccess: boolean;
  scope?: "merchant";
};

export type PlatformAdminTokenPayload = {
  userId: "platform-admin";
  merchantId: "platform-admin";
  role: "ADMIN";
  identifier: string;
  deviceId: "platform-admin";
  branchId: null;
  platformAccess: true;
  scope: "platform_admin";
  email: string;
};

export type AuthTokenPayload = MerchantAuthTokenPayload | PlatformAdminTokenPayload;

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}

export function isPlatformAdminToken(payload: AuthTokenPayload): payload is PlatformAdminTokenPayload {
  return payload.scope === "platform_admin";
}
