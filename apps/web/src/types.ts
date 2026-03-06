export type Role = "OWNER" | "MANAGER" | "CASHIER";

export type OrderStatus = "DRAFT" | "SENT" | "CONFIRMED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type PaymentMethod = "CASH" | "ECOCASH" | "ZIPIT" | "BANK_TRANSFER" | "OTHER" | "PAYNOW";
export type PaynowStatus = "AWAITING" | "PAID" | "FAILED" | "CANCELLED" | "UNKNOWN";

export type Merchant = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

export type User = {
  id: string;
  merchantId: string;
  identifier: string;
  role: Role;
  isActive?: boolean;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  cost?: number | null;
  sku?: string | null;
  stockQty: number;
  lowStockThreshold: number;
  updatedAt: string;
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
  customerId?: string | null;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: Customer | null;
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
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidAt: string;
  status: "PENDING" | "CONFIRMED";
  createdAt: string;
  paynowTransactionId?: string | null;
};

export type StockMovement = {
  id: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  reason?: string | null;
  orderId?: string | null;
  createdAt: string;
  product?: Product;
  order?: Order;
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
