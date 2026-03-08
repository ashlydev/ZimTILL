import { z } from "zod";
import {
  deliveryStatusValues,
  orderDocumentTypeValues,
  orderSourceValues,
  orderStatusValues,
  paymentMethodValues,
  paymentRecordStatusValues,
  paynowMethodValues,
  roleValues,
  stockMovementTypeValues,
  stockTransferStatusValues,
  subscriptionStatusValues,
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
  deviceId: z.string().trim().min(3).max(120),
  branchId: z.string().uuid().optional()
});

const baseEntitySchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
  updatedByUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
  lastModifiedByDeviceId: z.string().min(1)
});

export const branchSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  isDefault: z.boolean().default(false)
});

export const productSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1).max(120),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().nullable(),
  sku: z.string().trim().max(60).nullable(),
  category: z.string().trim().max(60).nullable().optional(),
  stockQty: z.number(),
  lowStockThreshold: z.number().nonnegative(),
  isPublished: z.boolean().default(true),
  isActive: z.boolean().default(true)
});

export const productStockSchema = baseEntitySchema.extend({
  productId: z.string().uuid(),
  qty: z.number(),
  lowStockThreshold: z.number().nonnegative()
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
  documentType: z.enum(orderDocumentTypeValues).default("ORDER"),
  source: z.enum(orderSourceValues).default("IN_STORE"),
  subtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100),
  total: z.number().nonnegative(),
  notes: z.string().trim().max(500).nullable(),
  customerName: z.string().trim().max(120).nullable().optional(),
  customerPhone: z.string().trim().max(30).nullable().optional(),
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
  status: z.enum(paymentRecordStatusValues),
  paynowTransactionId: z.string().uuid().nullable()
});

export const paynowTransactionSchema = baseEntitySchema.extend({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(20).nullable().optional(),
  reference: z.string().trim().min(1).max(120),
  pollUrl: z.string().trim().min(1),
  redirectUrl: z.string().trim().nullable().optional(),
  status: z.string().trim().min(1).max(40),
  rawInitResponse: z.record(z.any()).nullable().optional(),
  rawLastStatus: z.record(z.any()).nullable().optional()
});

export const stockMovementSchema = baseEntitySchema.extend({
  productId: z.string().uuid(),
  type: z.enum(stockMovementTypeValues),
  quantity: z.number(),
  reason: z.string().trim().max(150).nullable(),
  orderId: z.string().uuid().nullable()
});

export const stockTransferSchema = baseEntitySchema.extend({
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  status: z.enum(stockTransferStatusValues),
  requestedByUserId: z.string().uuid(),
  approvedByUserId: z.string().uuid().nullable(),
  receivedByUserId: z.string().uuid().nullable(),
  notes: z.string().trim().max(240).nullable()
});

export const stockTransferItemSchema = baseEntitySchema.extend({
  transferId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive()
});

export const deliverySchema = baseEntitySchema.extend({
  orderId: z.string().uuid(),
  assignedToUserId: z.string().uuid().nullable(),
  status: z.enum(deliveryStatusValues),
  proofPhotoUrl: z.string().trim().max(500).nullable(),
  deliveredAt: z.string().datetime().nullable()
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

export const catalogSettingsSchema = baseEntitySchema.extend({
  merchantSlug: z.string().trim().min(2).max(80),
  isEnabled: z.boolean().default(false),
  headline: z.string().trim().max(160).nullable(),
  description: z.string().trim().max(500).nullable(),
  checkoutPolicy: z.enum(["CONFIRM_ON_PAID", "CONFIRM_ON_CREATE"]).default("CONFIRM_ON_PAID")
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
  clientUpdatedAt: z.string().datetime(),
  userId: z.string().uuid(),
  deviceId: z.string().min(1).max(120)
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

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  planId: z.string().uuid(),
  status: z.enum(subscriptionStatusValues),
  billingPeriodStart: z.string().datetime(),
  billingPeriodEnd: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
