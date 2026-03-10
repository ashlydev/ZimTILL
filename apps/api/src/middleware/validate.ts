import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";

type Schema = ZodTypeAny;

export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path?.join(".") || "request";
        res.status(400).json({ message: `Invalid ${field}. Please review the form and try again.`, code: "VALIDATION_ERROR" });
        return;
      }
      next(error);
    }
  };
}

export function validateQuery(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path?.join(".") || "request";
        res.status(400).json({ message: `Invalid ${field}. Please review the form and try again.`, code: "VALIDATION_ERROR" });
        return;
      }
      next(error);
    }
  };
}
