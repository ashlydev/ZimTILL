import { z } from "zod";
import {
  orderStatusValues,
  paymentMethodValues,
  paynowMethodValues,
  roleValues,
  stockMovementTypeValues,
  syncEntityTypeValues,
  syncOpTypeValues
} from "./enums";

export const identifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .refine((value) => value.includes("@") || /^\+?[0-9]{7,15}$/.test(value), "Must be valid email or phone");

export const pinSchema = z.string().regex(/^[0-9]{4,6}$/);

export const registerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  identifier: identifierSchema,
  pin: pinSchema
});

export const loginSchema = z.object({
  identifier: identifierSchema,
  pin: pinSchema,
  deviceId: z.string().trim().min(3).max(120)
});

const baseEntitySchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
  lastModifiedByDeviceId: z.string().min(1)
});

export const productSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1).max(120),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().nullable(),
  sku: z.string().trim().max(60).nullable(),
  stockQty: z.number(),
  lowStockThreshold: z.number().int().nonnegative()
});

export const customerSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).nullable(),
  notes: z.string().trim().max(500).nullable()
});

export const orderSchema = baseEntitySchema.extend({
  customerId: z.string().uuid().nullable(),
  orderNumber: z.string().trim().min(1).max(40),
  status: z.enum(orderStatusValues),
  subtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100),
  total: z.number().nonnegative(),
  notes: z.string().trim().max(500).nullable(),
  confirmedAt: z.string().datetime().nullable()
});

export const orderItemSchema = baseEntitySchema.extend({
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative()
});

export const paymentSchema = baseEntitySchema.extend({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(paymentMethodValues),
  reference: z.string().trim().max(100).nullable(),
  paidAt: z.string().datetime(),
  status: z.enum(["PENDING", "CONFIRMED"]),
  paynowTransactionId: z.string().uuid().nullable()
});

export const stockMovementSchema = baseEntitySchema.extend({
  productId: z.string().uuid(),
  type: z.enum(stockMovementTypeValues),
  quantity: z.number(),
  reason: z.string().trim().max(150).nullable(),
  orderId: z.string().uuid().nullable()
});

export const settingsSchema = baseEntitySchema.extend({
  businessName: z.string().min(1).max(120),
  currencyCode: z.enum(["USD", "ZWL"]),
  currencySymbol: z.string().min(1).max(5),
  paymentInstructions: z.string().max(500),
  whatsappTemplate: z.string().max(1000),
  supportPhone: z.string().max(30).nullable(),
  supportEmail: z.string().email().nullable()
});

export const featureFlagSchema = z.object({
  id: z.string().uuid(),
  key: z.string().trim().min(2).max(80),
  enabled: z.boolean(),
  merchantId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const syncOperationSchema = z.object({
  opId: z.string().uuid(),
  entityType: z.enum(syncEntityTypeValues),
  opType: z.enum(syncOpTypeValues),
  entityId: z.string().uuid(),
  payload: z.record(z.any()),
  clientUpdatedAt: z.string().datetime()
});

export const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema).max(500)
});

export const syncPullQuerySchema = z.object({
  since: z.string().datetime().optional()
});

export const paynowInitiateSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(paynowMethodValues),
  phone: z.string().trim().min(7).max(20).optional()
});

export const paynowStatusSchema = z.object({
  transactionId: z.string().uuid()
});

export const roleSchema = z.enum(roleValues);
