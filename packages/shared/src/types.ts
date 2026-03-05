import { OrderStatus, PaymentMethod, Role, StockMovementType, SyncEntityType, SyncOpType } from "./enums";

export type BaseEntity = {
  id: string;
  merchantId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  lastModifiedByDeviceId: string;
};

export type Merchant = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type User = {
  id: string;
  merchantId: string;
  identifier: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Product = BaseEntity & {
  name: string;
  price: number;
  cost: number | null;
  sku: string | null;
  stockQty: number;
  lowStockThreshold: number;
};

export type Customer = BaseEntity & {
  name: string;
  phone: string | null;
  notes: string | null;
};

export type Order = BaseEntity & {
  customerId: string | null;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  notes: string | null;
  confirmedAt: string | null;
};

export type OrderItem = BaseEntity & {
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Payment = BaseEntity & {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  status: "PENDING" | "CONFIRMED";
  paynowTransactionId: string | null;
};

export type StockMovement = BaseEntity & {
  productId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  orderId: string | null;
};

export type Settings = BaseEntity & {
  businessName: string;
  currencyCode: "USD" | "ZWL";
  currencySymbol: string;
  paymentInstructions: string;
  whatsappTemplate: string;
  supportPhone: string | null;
  supportEmail: string | null;
};

export type FeatureFlag = {
  id: string;
  key: string;
  enabled: boolean;
  merchantId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncOperation = {
  opId: string;
  entityType: SyncEntityType;
  opType: SyncOpType;
  entityId: string;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
};

export type SyncPushRequest = {
  operations: SyncOperation[];
};

export type SyncPushResponse = {
  acceptedOpIds: string[];
  rejected: Array<{ opId: string; reason: string }>;
  serverTime: string;
};

export type SyncPullResponse = {
  serverTime: string;
  changes: {
    products: Product[];
    customers: Customer[];
    orders: Order[];
    orderItems: OrderItem[];
    payments: Payment[];
    stockMovements: StockMovement[];
    settings: Settings[];
    featureFlags: FeatureFlag[];
  };
};
