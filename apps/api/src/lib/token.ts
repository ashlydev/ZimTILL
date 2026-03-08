import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthTokenPayload = {
  userId: string;
  merchantId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "STOCK_CONTROLLER" | "DELIVERY_RIDER";
  identifier: string;
  deviceId: string;
  branchId: string | null;
  platformAccess: boolean;
};

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
