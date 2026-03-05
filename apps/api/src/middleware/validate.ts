import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodEffects, ZodError } from "zod";

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Validation failed", issues: error.flatten() });
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
        res.status(400).json({ message: "Validation failed", issues: error.flatten() });
        return;
      }
      next(error);
    }
  };
}
