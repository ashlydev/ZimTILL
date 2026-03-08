export const orderStatusValues = [
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED"
] as const;

export type OrderStatus = (typeof orderStatusValues)[number];

export const orderDocumentTypeValues = ["ORDER", "QUOTE", "INVOICE"] as const;
export type OrderDocumentType = (typeof orderDocumentTypeValues)[number];

export const orderSourceValues = ["IN_STORE", "ONLINE"] as const;
export type OrderSource = (typeof orderSourceValues)[number];

export const paymentMethodValues = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER", "PAYNOW"] as const;
export type PaymentMethod = (typeof paymentMethodValues)[number];

export const paymentRecordStatusValues = ["PENDING", "CONFIRMED", "FAILED", "CANCELLED"] as const;
export type PaymentRecordStatus = (typeof paymentRecordStatusValues)[number];

export const stockMovementTypeValues = ["IN", "OUT", "ADJUSTMENT", "TRANSFER_OUT", "TRANSFER_IN"] as const;
export type StockMovementType = (typeof stockMovementTypeValues)[number];

export const stockTransferStatusValues = ["DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED", "CANCELLED"] as const;
export type StockTransferStatus = (typeof stockTransferStatusValues)[number];

export const subscriptionStatusValues = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

export const deliveryStatusValues = ["PENDING", "ASSIGNED", "PICKED_UP", "DELIVERED", "FAILED"] as const;
export type DeliveryStatus = (typeof deliveryStatusValues)[number];

export const paynowMethodValues = ["ecocash", "onemoney", "web", "card", "other"] as const;
export type PaynowMethod = (typeof paynowMethodValues)[number];

export const paynowNormalizedStatusValues = ["PAID", "AWAITING", "FAILED", "CANCELLED", "UNKNOWN"] as const;
export type PaynowNormalizedStatus = (typeof paynowNormalizedStatusValues)[number];

export const roleValues = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "STOCK_CONTROLLER", "DELIVERY_RIDER"] as const;
export type Role = (typeof roleValues)[number];

export const syncEntityTypeValues = [
  "branch",
  "product",
  "productStock",
  "customer",
  "order",
  "orderItem",
  "payment",
  "paynowTransaction",
  "stockMovement",
  "stockTransfer",
  "stockTransferItem",
  "delivery",
  "settings",
  "catalogSettings",
  "featureFlag"
] as const;

export type SyncEntityType = (typeof syncEntityTypeValues)[number];

export const syncOpTypeValues = ["UPSERT", "DELETE"] as const;
export type SyncOpType = (typeof syncOpTypeValues)[number];
