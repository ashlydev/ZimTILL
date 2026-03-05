import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(16).optional(),
    JWT_EXPIRES_IN: z.string().default("7d"),
    CORS_ORIGIN: z.string().default("*"),
    PAYNOW_INTEGRATION_ID: z.string().optional(),
    PAYNOW_INTEGRATION_KEY: z.string().optional(),
    PAYNOW_RESULT_URL: z.string().url().optional(),
    PAYNOW_RETURN_URL: z.string().url().optional(),
    PAYNOW_TEST_MODE: z
      .string()
      .optional()
      .transform((value) => value === "true")
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production") {
      if (!value.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "DATABASE_URL is required in production"
        });
      }
      if (!value.JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "JWT_SECRET is required in production"
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema> & {
  DATABASE_URL: string;
  JWT_SECRET: string;
};

const parsed = envSchema.parse(process.env);

export const env: Env = {
  ...parsed,
  DATABASE_URL: parsed.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/novoriq_orders",
  JWT_SECRET: parsed.JWT_SECRET ?? "dev-only-secret-change-before-production"
};
