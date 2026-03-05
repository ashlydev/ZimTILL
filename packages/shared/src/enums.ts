export const orderStatusValues = [
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED"
] as const;

export type OrderStatus = (typeof orderStatusValues)[number];

export const paymentMethodValues = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER", "PAYNOW"] as const;
export type PaymentMethod = (typeof paymentMethodValues)[number];

export const stockMovementTypeValues = ["IN", "OUT", "ADJUSTMENT"] as const;
export type StockMovementType = (typeof stockMovementTypeValues)[number];

export const syncEntityTypeValues = [
  "product",
  "customer",
  "order",
  "orderItem",
  "payment",
  "stockMovement",
  "settings",
  "featureFlag"
] as const;

export type SyncEntityType = (typeof syncEntityTypeValues)[number];

export const syncOpTypeValues = ["UPSERT", "DELETE"] as const;
export type SyncOpType = (typeof syncOpTypeValues)[number];

export const paynowMethodValues = ["ecocash", "onemoney", "web", "card", "other"] as const;
export type PaynowMethod = (typeof paynowMethodValues)[number];

export const paynowNormalizedStatusValues = ["PAID", "AWAITING", "FAILED", "CANCELLED", "UNKNOWN"] as const;
export type PaynowNormalizedStatus = (typeof paynowNormalizedStatusValues)[number];

export const roleValues = ["OWNER", "MANAGER", "CASHIER"] as const;
export type Role = (typeof roleValues)[number];
