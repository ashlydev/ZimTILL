import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message, code: error.code ?? null });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      res.status(404).json({ message: "That record no longer exists. Refresh and try again.", code: "NOT_FOUND" });
      return;
    }

    if (error.code === "P2003") {
      res.status(400).json({ message: "A linked record is missing. Refresh your data and try again.", code: "REFERENCE_CONFLICT" });
      return;
    }

    res.status(400).json({ message: "The request could not be completed. Please check the data and try again.", code: "REQUEST_FAILED" });
    return;
  }

  res.status(500).json({ message: "Something went wrong on the server. Please try again.", code: "INTERNAL_ERROR" });
}
