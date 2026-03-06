import "dotenv/config";
import { z } from "zod";

const optionalString = () =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().optional()
  );

const optionalUrl = () =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional()
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: optionalString(),
    JWT_SECRET: optionalString(),
    JWT_EXPIRES_IN: z.string().default("7d"),
    CORS_ORIGIN: optionalString(),
    PAYNOW_INTEGRATION_ID: optionalString(),
    PAYNOW_INTEGRATION_KEY: optionalString(),
    PAYNOW_RESULT_URL: optionalUrl(),
    PAYNOW_RETURN_URL: optionalUrl(),
    PAYNOW_TEST_MODE: z.preprocess((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return undefined;
    }, z.boolean().optional())
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "test" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required"
      });
    }

    if (value.NODE_ENV !== "test" && !value.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET is required"
      });
    } else if (value.JWT_SECRET && value.JWT_SECRET.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be at least 16 characters"
      });
    }
  });

export type Env = z.infer<typeof envSchema> & {
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  PAYNOW_TEST_MODE: boolean;
};

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${message}`);
}

export const env: Env = {
  ...parsed.data,
  CORS_ORIGIN: parsed.data.CORS_ORIGIN ?? "*",
  PAYNOW_TEST_MODE: parsed.data.PAYNOW_TEST_MODE ?? false,
  DATABASE_URL: parsed.data.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/novoriq_orders_test",
  JWT_SECRET: parsed.data.JWT_SECRET ?? "test-only-secret-change-me"
};
