import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/token";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing authorization token" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Invalid authorization token" });
  }
}
