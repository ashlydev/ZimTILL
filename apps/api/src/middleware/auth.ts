import { NextFunction, Request, Response } from "express";
import { isPlatformAdminToken, verifyToken } from "../lib/token";
import { prisma } from "../lib/prisma";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing authorization token" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = verifyToken(token);

    if (isPlatformAdminToken(decoded)) {
      res.status(401).json({ message: "Merchant session required" });
      return;
    }

    const [user, device, merchant] = await Promise.all([
      prisma.user.findFirst({
        where: {
          id: decoded.userId,
          merchantId: decoded.merchantId,
          deletedAt: null,
          isActive: true
        }
      }),
      prisma.device.findFirst({
        where: {
          merchantId: decoded.merchantId,
          userId: decoded.userId,
          deviceId: decoded.deviceId,
          deletedAt: null,
          revokedAt: null
        }
      }),
      prisma.merchant.findFirst({
        where: {
          id: decoded.merchantId,
          deletedAt: null
        }
      })
    ]);

    if (!user || !device) {
      res.status(401).json({ message: "Session expired or device revoked" });
      return;
    }

    if (!merchant?.isActive) {
      res.status(403).json({ message: "Merchant account is deactivated. Contact support on WhatsApp for help.", code: "MERCHANT_DISABLED" });
      return;
    }

    req.user = {
      ...decoded,
      role: user.role,
      identifier: user.identifier,
      branchId: device.activeBranchId ?? user.defaultBranchId ?? decoded.branchId ?? null,
      platformAccess: false
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid authorization token" });
  }
}
