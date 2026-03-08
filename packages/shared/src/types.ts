import type {
  DeliveryStatus,
  OrderDocumentType,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentRecordStatus,
  Role,
  StockMovementType,
  StockTransferStatus,
  SubscriptionStatus,
  SyncEntityType,
  SyncOpType
} from "./enums";

export type BaseEntity = {
  id: string;
  merchantId: string;
  branchId?: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  lastModifiedByDeviceId: string;
};

export type Merchant = {
  id: string;
  name: string;
  slug?: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Branch = BaseEntity & {
  name: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
};

export type User = {
  id: string;
  merchantId: string;
  defaultBranchId?: string | null;
  identifier: string;
  role: Role;
  isActive?: boolean;
  isPlatformAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string;
  merchantId: string;
  planId: string;
  status: SubscriptionStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
  plan?: Plan | null;
};

export type UsageCounter = {
  id: string;
  merchantId: string;
  key: string;
  periodStart: string;
  periodEnd: string;
  count: number;
  updatedAt: string;
};

export type Product = BaseEntity & {
  name: string;
  price: number;
  cost: number | null;
  sku: string | null;
  category?: string | null;
  stockQty: number;
  lowStockThreshold: number;
  isPublished?: boolean;
  isActive?: boolean;
};

export type ProductStock = BaseEntity & {
  productId: string;
  qty: number;
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
  documentType?: OrderDocumentType;
  source?: OrderSource;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  notes: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
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
  status: PaymentRecordStatus;
  paynowTransactionId: string | null;
};

export type PaynowTransaction = BaseEntity & {
  orderId: string;
  amount: number;
  method: string;
  phone: string | null;
  reference: string;
  pollUrl: string;
  redirectUrl: string | null;
  status: string;
  rawInitResponse?: Record<string, unknown> | null;
  rawLastStatus?: Record<string, unknown> | null;
};

export type StockMovement = BaseEntity & {
  productId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  orderId: string | null;
};

export type StockTransfer = BaseEntity & {
  fromBranchId: string;
  toBranchId: string;
  status: StockTransferStatus;
  requestedByUserId: string;
  approvedByUserId: string | null;
  receivedByUserId: string | null;
  notes: string | null;
};

export type StockTransferItem = BaseEntity & {
  transferId: string;
  productId: string;
  quantity: number;
};

export type Delivery = BaseEntity & {
  orderId: string;
  assignedToUserId: string | null;
  status: DeliveryStatus;
  proofPhotoUrl: string | null;
  deliveredAt: string | null;
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

export type CatalogSettings = BaseEntity & {
  merchantSlug: string;
  isEnabled: boolean;
  headline: string | null;
  description: string | null;
  checkoutPolicy: "CONFIRM_ON_PAID" | "CONFIRM_ON_CREATE";
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
  userId: string;
  deviceId: string;
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
    branches: Branch[];
    products: Product[];
    productStocks: ProductStock[];
    customers: Customer[];
    orders: Order[];
    orderItems: OrderItem[];
    payments: Payment[];
    paynowTransactions: PaynowTransaction[];
    stockMovements: StockMovement[];
    transfers: StockTransfer[];
    transferItems: StockTransferItem[];
    deliveries: Delivery[];
    settings: Settings[];
    catalogSettings: CatalogSettings[];
    featureFlags: FeatureFlag[];
  };
};
