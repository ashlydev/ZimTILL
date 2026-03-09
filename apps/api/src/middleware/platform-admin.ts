import type { NextFunction, Request, Response } from "express";
import { getPlatformAdminEmail } from "../config/platform-admin";
import { isPlatformAdminToken, verifyToken } from "../lib/token";

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing authorization token" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = verifyToken(token);

    if (!isPlatformAdminToken(decoded)) {
      res.status(403).json({ message: "Platform admin access required" });
      return;
    }

    if (decoded.email.toLowerCase() !== getPlatformAdminEmail().toLowerCase()) {
      res.status(401).json({ message: "Platform admin session expired" });
      return;
    }

    req.platformAdmin = {
      email: decoded.email
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid authorization token" });
  }
}
