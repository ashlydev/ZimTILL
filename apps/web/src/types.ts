export type Role = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "STOCK_CONTROLLER" | "DELIVERY_RIDER";

export type OrderStatus = "DRAFT" | "SENT" | "CONFIRMED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type OrderDocumentType = "ORDER" | "QUOTE" | "INVOICE";
export type OrderSource = "IN_STORE" | "ONLINE";
export type PaymentMethod = "CASH" | "ECOCASH" | "ZIPIT" | "BANK_TRANSFER" | "OTHER" | "PAYNOW";
export type PaymentRecordStatus = "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED";
export type PaynowStatus = "AWAITING" | "PAID" | "FAILED" | "CANCELLED" | "UNKNOWN";
export type TransferStatus = "DRAFT" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
export type DeliveryStatus = "PENDING" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "FAILED";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

export type Merchant = {
  id: string;
  name: string;
  slug?: string;
  phone?: string | null;
  email?: string | null;
};

export type Branch = {
  id: string;
  merchantId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  stockLines?: number;
  isActive?: boolean;
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
};

export type Subscription = {
  id: string;
  merchantId: string;
  planId: string;
  status: SubscriptionStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
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

export type User = {
  id: string;
  merchantId: string;
  defaultBranchId?: string | null;
  identifier: string;
  role: Role;
  isActive?: boolean;
  isPlatformAdmin?: boolean;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  cost?: number | null;
  sku?: string | null;
  category?: string | null;
  stockQty: number;
  lowStockThreshold: number;
  branchStockQty?: number;
  branchLowStockThreshold?: number;
  isPublished?: boolean;
  isActive?: boolean;
  updatedAt: string;
};

export type ProductStock = {
  id: string;
  branchId: string;
  productId: string;
  qty: number;
  lowStockThreshold: number;
  updatedAt: string;
  product?: Product;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  updatedAt: string;
};

export type Order = {
  id: string;
  branchId?: string | null;
  customerId?: string | null;
  orderNumber: string;
  status: OrderStatus;
  documentType?: OrderDocumentType;
  source?: OrderSource;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  notes?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: Customer | null;
  delivery?: Delivery | null;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product?: Product;
};

export type Payment = {
  id: string;
  orderId: string;
  branchId?: string | null;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidAt: string;
  status: PaymentRecordStatus;
  createdAt: string;
  paynowTransactionId?: string | null;
};

export type StockMovement = {
  id: string;
  branchId?: string | null;
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER_OUT" | "TRANSFER_IN";
  quantity: number;
  reason?: string | null;
  orderId?: string | null;
  createdAt: string;
  product?: Product;
  order?: Order;
};

export type StockTransfer = {
  id: string;
  merchantId: string;
  fromBranchId: string;
  toBranchId: string;
  status: TransferStatus;
  requestedByUserId: string;
  approvedByUserId?: string | null;
  receivedByUserId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  fromBranch?: Branch;
  toBranch?: Branch;
  items?: Array<{
    id: string;
    productId: string;
    quantity: number;
    product?: Product;
  }>;
};

export type Delivery = {
  id: string;
  merchantId: string;
  branchId?: string | null;
  orderId: string;
  assignedToUserId?: string | null;
  status: DeliveryStatus;
  proofPhotoUrl?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: Order;
  assignedTo?: {
    id: string;
    identifier: string;
    role: Role;
  } | null;
};

export type Settings = {
  id: string;
  businessName: string;
  currencyCode: "USD" | "ZWL";
  currencySymbol: string;
  paymentInstructions: string;
  whatsappTemplate: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
};

export type CatalogSettings = {
  id: string;
  merchantId: string;
  merchantSlug: string;
  isEnabled: boolean;
  headline?: string | null;
  description?: string | null;
  checkoutPolicy: "CONFIRM_ON_PAID" | "CONFIRM_ON_CREATE";
};

export type FeatureFlag = {
  id: string;
  key: string;
  enabled: boolean;
  merchantId: string | null;
};

export type ReportsSummary = {
  salesBasis: string;
  today: {
    salesTotal: number;
    ordersCount: number;
  };
  last7Days: {
    salesTotal: number;
    ordersCount: number;
    topProducts: Array<{ productId: string; name: string; qty: number }>;
  };
};

export type StaffUser = {
  id: string;
  merchantId: string;
  identifier: string;
  role: Role;
  isActive: boolean;
  isPlatformAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
  activeDevices?: number;
  lastSeenAt?: string | null;
};

export type DeviceSession = {
  id: string;
  merchantId: string;
  userId: string;
  deviceId: string;
  activeBranchId?: string | null;
  lastSeenAt: string;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    identifier: string;
    role: Role;
    isActive: boolean;
  };
};

export type BackupPayload = {
  version: string;
  exportedAt: string;
  merchant?: Merchant | null;
  data: {
    settings: Settings[];
    products: Product[];
    customers: Customer[];
    orders: Order[];
    orderItems: OrderItem[];
    payments: Payment[];
    stockMovements: StockMovement[];
  };
};

export type ReceiptData = {
  orderId: string;
  orderNumber: string;
  receiptNumber: string;
  dateTime: string;
  businessName: string;
  logoPlaceholder: string;
  customerName: string;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  totals: {
    subtotal: number;
    discountAmount: number;
    discountPercent: number;
    total: number;
    paid: number;
    balance: number;
  };
  payments: Array<{ id: string; method: string; amount: number; reference?: string | null; status: string; paidAt: string }>;
  paynowStatus?: string | null;
  qrPayload: string;
  currencySymbol: string;
};

export type CatalogPublicPayload = {
  merchant: Merchant | null;
  settings: CatalogSettings;
  categories: string[];
  products: Product[];
};
