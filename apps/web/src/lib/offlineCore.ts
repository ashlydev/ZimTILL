import type {
  Customer,
  Order,
  OrderItem,
  Payment,
  PaymentMethod,
  Product,
  ReceiptData,
  ReportsSummary,
  Settings,
  StockMovement
} from "../types";
import { getAuthSnapshot, getDeviceId, getLastPullAt, setSyncMetadata } from "./storage";

export type InventoryAdjustmentReason = "RETURN" | "EXPIRED" | "DAMAGED";

type OfflineEntityType = "product" | "customer" | "order" | "orderItem" | "payment" | "stockMovement" | "settings";
type OfflineStoreName = "products" | "customers" | "orders" | "orderItems" | "payments" | "stockMovements" | "settings";
type OutboxOperation = {
  opId: string;
  merchantId: string;
  entityType: OfflineEntityType;
  opType: "UPSERT" | "DELETE";
  entityId: string;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
};

type SyncPullResponse = {
  serverTime: string;
  changes: {
    products?: Product[];
    customers?: Customer[];
    orders?: Order[];
    orderItems?: OrderItem[];
    payments?: Payment[];
    stockMovements?: StockMovement[];
    settings?: Settings[];
  };
};

type SyncPushResponse = {
  acceptedOpIds: string[];
  rejected: Array<{ opId: string; reason: string }>;
  serverTime: string;
};

type OfflineSessionContext = {
  merchantId: string;
  deviceId: string;
  activeBranchId: string | null;
  businessName: string;
};

type SaveProductInput = {
  id?: string;
  name: string;
  price: number;
  cost?: number | null;
  sku?: string | null;
  stockQty: number;
  lowStockThreshold: number;
};

type SaveCustomerInput = {
  id?: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
};

type CreateOrderInput = {
  customerId?: string | null;
  items: Array<{ productId: string; quantity: number }>;
  discountAmount?: number;
  discountPercent?: number;
  notes?: string;
};

type AddPaymentInput = {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidAt?: string;
  status?: Payment["status"];
  paynowTransactionId?: string | null;
};

type RecordInventoryAdjustmentInput = {
  productId: string;
  quantity: number;
  reason: InventoryAdjustmentReason;
  notes?: string | null;
  orderId?: string | null;
  occurredAt?: string;
};

type OrderDetailsPayload = {
  order: Order & {
    customer?: Customer | null;
    items: Array<OrderItem & { product: Product }>;
    payments: Payment[];
  };
  summary: {
    paid: number;
    balance: number;
  };
};

type ReturnsExpiredSummary = {
  returnsCount: number;
  returnsValue: number;
  expiredCount: number;
  expiredValue: number;
  damagedCount: number;
  damagedValue: number;
};

const DB_NAME = "zimtill-offline-core";
const DB_VERSION = 1;
const STORE_NAMES: OfflineStoreName[] = ["products", "customers", "orders", "orderItems", "payments", "stockMovements", "settings"];
const ORDER_ACTIVE_STATUSES = ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID"];
const MANUAL_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER"];

let databasePromise: Promise<IDBDatabase> | null = null;
let syncPromise: Promise<{ serverTime: string; pushed: number; pulled: number }> | null = null;

function resolveApiBaseUrl() {
  const envBase = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;

  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:3000";
  }

  return "https://novoriq-api.onrender.com";
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function isBrowserOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function isNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("offline")
  );
}

function createOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `NVO-${stamp}-${rand}`;
}

function normalizeStatus(status: string): Order["status"] {
  if (["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(status)) {
    return status as Order["status"];
  }
  return "DRAFT";
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const storeName of STORE_NAMES) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "opId" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open offline database"));
    });
  }

  return databasePromise;
}

async function readAll<T>(storeName: OfflineStoreName | "outbox") {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await requestToPromise(store.getAll() as IDBRequest<T[]>);
  await transactionDone(transaction);
  return result;
}

async function readById<T>(storeName: OfflineStoreName, id: string) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await requestToPromise(store.get(id) as IDBRequest<T | undefined>);
  await transactionDone(transaction);
  return result ?? null;
}

async function writeOne<T>(storeName: OfflineStoreName | "outbox", value: T) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value as T);
  await transactionDone(transaction);
}

async function writeMany<T>(storeName: OfflineStoreName, values: T[]) {
  if (values.length === 0) return;
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  for (const value of values) {
    store.put(value as T);
  }
  await transactionDone(transaction);
}

async function deleteManyOutbox(opIds: string[]) {
  if (opIds.length === 0) return;
  const db = await openDatabase();
  const transaction = db.transaction("outbox", "readwrite");
  const store = transaction.objectStore("outbox");
  for (const opId of opIds) {
    store.delete(opId);
  }
  await transactionDone(transaction);
}

function requireSessionContext(): OfflineSessionContext {
  const snapshot = getAuthSnapshot();
  if (!snapshot?.merchant?.id) {
    throw new Error("Offline session is not ready");
  }

  return {
    merchantId: snapshot.merchant.id,
    deviceId: getDeviceId(),
    activeBranchId: snapshot.activeBranchId ?? null,
    businessName: snapshot.merchant.name ?? "ZimTILL"
  };
}

function matchesMerchant<T extends { merchantId?: string | null; deletedAt?: string | null }>(merchantId: string, row: T) {
  return row.merchantId === merchantId && !row.deletedAt;
}

function searchContains(source: string | null | undefined, query: string) {
  return (source || "").toLowerCase().includes(query.toLowerCase());
}

function formatAdjustmentReason(reason: InventoryAdjustmentReason, notes?: string | null) {
  return notes?.trim() ? `${reason}: ${notes.trim()}` : reason;
}

function parseAdjustmentReason(reason: string | null | undefined): InventoryAdjustmentReason | null {
  if (!reason) return null;
  if (reason.startsWith("RETURN")) return "RETURN";
  if (reason.startsWith("EXPIRED")) return "EXPIRED";
  if (reason.startsWith("DAMAGED")) return "DAMAGED";
  return null;
}

function shouldApplyServerRecord(localUpdatedAt: string | undefined, serverUpdatedAt: string) {
  if (!localUpdatedAt) return true;
  return new Date(serverUpdatedAt).getTime() >= new Date(localUpdatedAt).getTime();
}

async function enqueueOperation(operation: Omit<OutboxOperation, "opId" | "clientUpdatedAt"> & { clientUpdatedAt?: string }) {
  const outboxOperation: OutboxOperation = {
    ...operation,
    opId: makeId("op"),
    clientUpdatedAt: operation.clientUpdatedAt ?? nowIso()
  };

  await writeOne("outbox", outboxOperation);
}

async function listStoreRows<T extends { merchantId?: string | null; updatedAt: string; deletedAt?: string | null }>(
  storeName: OfflineStoreName,
  merchantId: string
) {
  const rows = await readAll<T>(storeName);
  return rows
    .filter((row) => matchesMerchant(merchantId, row))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function getProductById(merchantId: string, id: string) {
  const product = await readById<Product>("products", id);
  if (!product || product.merchantId !== merchantId || product.deletedAt) {
    return null;
  }
  return product;
}

async function getCustomerById(merchantId: string, id: string) {
  const customer = await readById<Customer>("customers", id);
  if (!customer || customer.merchantId !== merchantId || customer.deletedAt) {
    return null;
  }
  return customer;
}

async function getOrderById(merchantId: string, id: string) {
  const order = await readById<Order>("orders", id);
  if (!order || order.merchantId !== merchantId || order.deletedAt) {
    return null;
  }
  return order;
}

async function getSettingsRecord(merchantId: string) {
  const settings = (await listStoreRows<Settings>("settings", merchantId))[0] ?? null;
  if (settings) {
    return settings;
  }

  const context = requireSessionContext();
  const now = nowIso();
  const fallback: Settings = {
    id: makeId("settings"),
    merchantId,
    businessName: context.businessName,
    currencyCode: "USD",
    currencySymbol: "$",
    paymentInstructions: "EcoCash / ZIPIT / Bank transfer / Cash",
    whatsappTemplate:
      "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.",
    supportPhone: null,
    supportEmail: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("settings", fallback);
  await enqueueOperation({
    merchantId,
    entityType: "settings",
    opType: "UPSERT",
    entityId: fallback.id,
    payload: fallback
  });

  return fallback;
}

async function updateOrderTotalsFromPayments(orderId: string) {
  const context = requireSessionContext();
  const order = await getOrderById(context.merchantId, orderId);
  if (!order || order.status === "CANCELLED") {
    return null;
  }

  const payments = (await listStoreRows<Payment>("payments", context.merchantId)).filter(
    (payment) => payment.orderId === orderId && payment.status === "CONFIRMED"
  );

  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  let nextStatus = order.status;
  if (paid <= 0) {
    if (["PAID", "PARTIALLY_PAID"].includes(order.status)) {
      nextStatus = "CONFIRMED";
    }
  } else if (paid >= Number(order.total)) {
    nextStatus = "PAID";
  } else {
    nextStatus = "PARTIALLY_PAID";
  }

  if (nextStatus !== order.status) {
    const nextOrder: Order = {
      ...order,
      status: nextStatus,
      updatedAt: nowIso(),
      version: order.version + 1,
      lastModifiedByDeviceId: context.deviceId
    };
    await writeOne("orders", nextOrder);
    await enqueueOperation({
      merchantId: context.merchantId,
      entityType: "order",
      opType: "UPSERT",
      entityId: nextOrder.id,
      payload: nextOrder
    });
    return nextOrder;
  }

  return order;
}

async function createStockMovementRecord(input: {
  merchantId: string;
  branchId?: string | null;
  productId: string;
  type: StockMovement["type"];
  quantity: number;
  reason?: string | null;
  orderId?: string | null;
  createdAt?: string;
}) {
  const context = requireSessionContext();
  const createdAt = input.createdAt ?? nowIso();
  const movement: StockMovement = {
    id: makeId("movement"),
    merchantId: input.merchantId,
    branchId: input.branchId ?? null,
    productId: input.productId,
    type: input.type,
    quantity: input.quantity,
    reason: input.reason ?? null,
    orderId: input.orderId ?? null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("stockMovements", movement);
  await enqueueOperation({
    merchantId: input.merchantId,
    entityType: "stockMovement",
    opType: "UPSERT",
    entityId: movement.id,
    payload: movement,
    clientUpdatedAt: movement.updatedAt
  });

  return movement;
}

export async function listProductsLocal(search = "", lowStockOnly = false) {
  const { merchantId } = requireSessionContext();
  const products = await listStoreRows<Product>("products", merchantId);
  const filtered = products.filter((product) => {
    if (!search.trim()) return true;
    return searchContains(product.name, search) || searchContains(product.sku, search);
  });

  if (!lowStockOnly) {
    return filtered;
  }

  return filtered.filter((product) => Number(product.stockQty) <= Number(product.lowStockThreshold));
}

export async function saveProductLocal(input: SaveProductInput) {
  const context = requireSessionContext();
  const existing = input.id ? await getProductById(context.merchantId, input.id) : null;
  const now = nowIso();

  const product: Product = {
    id: existing?.id ?? input.id ?? makeId("product"),
    merchantId: context.merchantId,
    name: input.name,
    price: Number(input.price),
    cost: input.cost ?? existing?.cost ?? null,
    sku: input.sku ?? existing?.sku ?? null,
    category: existing?.category ?? null,
    stockQty: Number(input.stockQty),
    lowStockThreshold: Number(input.lowStockThreshold),
    branchStockQty: context.activeBranchId ? Number(input.stockQty) : undefined,
    branchLowStockThreshold: context.activeBranchId ? Number(input.lowStockThreshold) : undefined,
    isPublished: existing?.isPublished ?? true,
    isActive: existing?.isActive ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    version: (existing?.version ?? 0) + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("products", product);
  await enqueueOperation({
    merchantId: context.merchantId,
    entityType: "product",
    opType: "UPSERT",
    entityId: product.id,
    payload: product
  });

  return product;
}

export async function deleteProductLocal(productId: string) {
  const context = requireSessionContext();
  const product = await getProductById(context.merchantId, productId);
  if (!product) return;

  const next: Product = {
    ...product,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    version: product.version + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("products", next);
  await enqueueOperation({
    merchantId: context.merchantId,
    entityType: "product",
    opType: "DELETE",
    entityId: productId,
    payload: next,
    clientUpdatedAt: next.updatedAt
  });
}

export async function adjustStockLocal(productId: string, quantity: number, reason?: string) {
  const context = requireSessionContext();
  const product = await getProductById(context.merchantId, productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const next = await saveProductLocal({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    cost: product.cost ?? null,
    sku: product.sku ?? null,
    stockQty: Number(product.stockQty) + Number(quantity),
    lowStockThreshold: Number(product.lowStockThreshold)
  });

  await createStockMovementRecord({
    merchantId: context.merchantId,
    branchId: context.activeBranchId,
    productId,
    type: "ADJUSTMENT",
    quantity,
    reason: reason ?? "Manual adjustment"
  });

  return next;
}

export async function recordInventoryAdjustmentLocal(input: RecordInventoryAdjustmentInput) {
  const context = requireSessionContext();
  const product = await getProductById(context.merchantId, input.productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const absoluteQty = Math.abs(Number(input.quantity));
  const signedQuantity = input.reason === "RETURN" ? absoluteQty : -absoluteQty;
  const type: StockMovement["type"] = input.reason === "RETURN" ? "IN" : "OUT";

  await saveProductLocal({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    cost: product.cost ?? null,
    sku: product.sku ?? null,
    stockQty: Number(product.stockQty) + signedQuantity,
    lowStockThreshold: Number(product.lowStockThreshold)
  });

  return createStockMovementRecord({
    merchantId: context.merchantId,
    branchId: context.activeBranchId,
    productId: input.productId,
    type,
    quantity: signedQuantity,
    reason: formatAdjustmentReason(input.reason, input.notes),
    orderId: input.orderId ?? null,
    createdAt: input.occurredAt ?? nowIso()
  });
}

export async function listCustomersLocal(search = "") {
  const { merchantId } = requireSessionContext();
  const customers = await listStoreRows<Customer>("customers", merchantId);
  return customers.filter((customer) => {
    if (!search.trim()) return true;
    return searchContains(customer.name, search) || searchContains(customer.phone, search);
  });
}

export async function saveCustomerLocal(input: SaveCustomerInput) {
  const context = requireSessionContext();
  const existing = input.id ? await getCustomerById(context.merchantId, input.id) : null;
  const now = nowIso();

  const customer: Customer = {
    id: existing?.id ?? input.id ?? makeId("customer"),
    merchantId: context.merchantId,
    name: input.name,
    phone: input.phone ?? existing?.phone ?? null,
    notes: input.notes ?? existing?.notes ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    version: (existing?.version ?? 0) + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("customers", customer);
  await enqueueOperation({
    merchantId: context.merchantId,
    entityType: "customer",
    opType: "UPSERT",
    entityId: customer.id,
    payload: customer
  });

  return customer;
}

export async function deleteCustomerLocal(customerId: string) {
  const context = requireSessionContext();
  const customer = await getCustomerById(context.merchantId, customerId);
  if (!customer) return;

  const next: Customer = {
    ...customer,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    version: customer.version + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("customers", next);
  await enqueueOperation({
    merchantId: context.merchantId,
    entityType: "customer",
    opType: "DELETE",
    entityId: customer.id,
    payload: next,
    clientUpdatedAt: next.updatedAt
  });
}

export async function listOrdersLocal(search = "") {
  const { merchantId, activeBranchId } = requireSessionContext();
  const [orders, customers] = await Promise.all([
    listStoreRows<Order>("orders", merchantId),
    listStoreRows<Customer>("customers", merchantId)
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return orders
    .filter((order) => !activeBranchId || order.branchId === activeBranchId)
    .filter((order) => {
      if (!search.trim()) return true;
      const customer = order.customerId ? customerById.get(order.customerId) : null;
      return searchContains(order.orderNumber, search) || searchContains(customer?.name, search);
    })
    .map((order) => ({
      ...order,
      customer: order.customerId ? customerById.get(order.customerId) ?? null : null
    }));
}

export async function createOrderLocal(input: CreateOrderInput) {
  const context = requireSessionContext();
  const now = nowIso();
  const items: OrderItem[] = [];
  let subtotal = 0;

  for (const rawItem of input.items) {
    const product = await getProductById(context.merchantId, rawItem.productId);
    if (!product) {
      throw new Error("One or more selected products are unavailable");
    }

    const lineTotal = Number(product.price) * Number(rawItem.quantity);
    subtotal += lineTotal;

    items.push({
      id: makeId("order-item"),
      merchantId: context.merchantId,
      orderId: "",
      productId: rawItem.productId,
      quantity: Number(rawItem.quantity),
      unitPrice: Number(product.price),
      lineTotal,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      lastModifiedByDeviceId: context.deviceId
    });
  }

  const discountPercent = Number(input.discountPercent ?? 0);
  const explicitDiscountAmount = Number(input.discountAmount ?? 0);
  const discountAmount = explicitDiscountAmount > 0 ? explicitDiscountAmount : subtotal * (discountPercent / 100);
  const total = Math.max(subtotal - discountAmount, 0);
  const customer = input.customerId ? await getCustomerById(context.merchantId, input.customerId) : null;
  const orderId = makeId("order");

  const order: Order = {
    id: orderId,
    merchantId: context.merchantId,
    branchId: context.activeBranchId,
    customerId: input.customerId ?? null,
    orderNumber: createOrderNumber(),
    status: "DRAFT",
    documentType: "ORDER",
    source: "IN_STORE",
    subtotal,
    discountAmount,
    discountPercent,
    total,
    notes: input.notes?.trim() || null,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: context.deviceId
  };

  const orderItems = items.map((item) => ({ ...item, orderId }));

  await writeOne("orders", order);
  await writeMany("orderItems", orderItems);
  await enqueueOperation({ merchantId: context.merchantId, entityType: "order", opType: "UPSERT", entityId: order.id, payload: order });
  for (const item of orderItems) {
    await enqueueOperation({ merchantId: context.merchantId, entityType: "orderItem", opType: "UPSERT", entityId: item.id, payload: item });
  }

  return order;
}

export async function getOrderDetailsLocal(orderId: string): Promise<OrderDetailsPayload | null> {
  const context = requireSessionContext();
  const [order, items, products, customers, payments] = await Promise.all([
    getOrderById(context.merchantId, orderId),
    listStoreRows<OrderItem>("orderItems", context.merchantId),
    listStoreRows<Product>("products", context.merchantId),
    listStoreRows<Customer>("customers", context.merchantId),
    listStoreRows<Payment>("payments", context.merchantId)
  ]);

  if (!order) {
    return null;
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const orderItems = items
    .filter((item) => item.orderId === orderId)
    .map((item) => ({
      ...item,
      product: productById.get(item.productId) ?? {
        id: item.productId,
        merchantId: context.merchantId,
        branchId: order.branchId ?? context.activeBranchId,
        createdAt: item.createdAt,
        name: "Deleted product",
        price: Number(item.unitPrice),
        cost: null,
        sku: null,
        stockQty: 0,
        lowStockThreshold: 0,
        updatedAt: item.updatedAt,
        deletedAt: null,
        version: 1,
        lastModifiedByDeviceId: context.deviceId
      }
    }));

  const orderPayments = payments.filter((payment) => payment.orderId === orderId);
  const paid = orderPayments
    .filter((payment) => payment.status === "CONFIRMED")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  return {
    order: {
      ...order,
      customer: order.customerId ? customerById.get(order.customerId) ?? null : null,
      items: orderItems,
      payments: orderPayments.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    },
    summary: {
      paid,
      balance: Math.max(Number(order.total) - paid, 0)
    }
  };
}

export async function updateOrderStatusLocal(orderId: string, status: Order["status"]) {
  const context = requireSessionContext();
  const order = await getOrderById(context.merchantId, orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const next: Order = {
    ...order,
    status: normalizeStatus(status),
    updatedAt: nowIso(),
    version: order.version + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("orders", next);
  await enqueueOperation({ merchantId: context.merchantId, entityType: "order", opType: "UPSERT", entityId: next.id, payload: next });
  return next;
}

export async function confirmOrderLocal(orderId: string) {
  const context = requireSessionContext();
  const details = await getOrderDetailsLocal(orderId);
  if (!details) {
    throw new Error("Order not found");
  }

  if (["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(details.order.status)) {
    return details.order;
  }

  const confirmedAt = nowIso();
  const nextOrder: Order = {
    ...details.order,
    status: "CONFIRMED",
    confirmedAt,
    updatedAt: confirmedAt,
    version: details.order.version + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("orders", nextOrder);
  await enqueueOperation({ merchantId: context.merchantId, entityType: "order", opType: "UPSERT", entityId: nextOrder.id, payload: nextOrder });

  for (const item of details.order.items) {
    const product = await getProductById(context.merchantId, item.productId);
    if (!product) continue;

    await saveProductLocal({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      cost: product.cost ?? null,
      sku: product.sku ?? null,
      stockQty: Number(product.stockQty) - Number(item.quantity),
      lowStockThreshold: Number(product.lowStockThreshold)
    });

    await createStockMovementRecord({
      merchantId: context.merchantId,
      branchId: nextOrder.branchId ?? context.activeBranchId,
      productId: item.productId,
      type: "OUT",
      quantity: -Number(item.quantity),
      reason: `Order confirmed ${nextOrder.orderNumber}`,
      orderId: nextOrder.id,
      createdAt: confirmedAt
    });
  }

  return nextOrder;
}

export async function cancelOrderLocal(orderId: string) {
  const context = requireSessionContext();
  const details = await getOrderDetailsLocal(orderId);
  if (!details) {
    throw new Error("Order not found");
  }

  if (details.order.status === "CANCELLED") {
    return details.order;
  }

  const now = nowIso();
  const wasConfirmed = ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(details.order.status);
  const nextOrder: Order = {
    ...details.order,
    status: "CANCELLED",
    updatedAt: now,
    version: details.order.version + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await writeOne("orders", nextOrder);
  await enqueueOperation({ merchantId: context.merchantId, entityType: "order", opType: "UPSERT", entityId: nextOrder.id, payload: nextOrder });

  if (wasConfirmed) {
    for (const item of details.order.items) {
      const product = await getProductById(context.merchantId, item.productId);
      if (!product) continue;

      await saveProductLocal({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        cost: product.cost ?? null,
        sku: product.sku ?? null,
        stockQty: Number(product.stockQty) + Number(item.quantity),
        lowStockThreshold: Number(product.lowStockThreshold)
      });

      await createStockMovementRecord({
        merchantId: context.merchantId,
        branchId: nextOrder.branchId ?? context.activeBranchId,
        productId: item.productId,
        type: "IN",
        quantity: Number(item.quantity),
        reason: `Order cancelled ${nextOrder.orderNumber}`,
        orderId: nextOrder.id,
        createdAt: now
      });
    }
  }

  return nextOrder;
}

export async function listPaymentsLocal() {
  const { merchantId, activeBranchId } = requireSessionContext();
  const payments = await listStoreRows<Payment>("payments", merchantId);
  return payments.filter((payment) => !activeBranchId || payment.branchId === activeBranchId);
}

export async function addPaymentLocal(input: AddPaymentInput) {
  const context = requireSessionContext();
  const order = await getOrderById(context.merchantId, input.orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const now = nowIso();
  const payment: Payment = {
    id: makeId("payment"),
    merchantId: context.merchantId,
    branchId: order.branchId ?? context.activeBranchId,
    orderId: input.orderId,
    amount: Number(input.amount),
    method: input.method,
    reference: input.reference ?? null,
    paidAt: input.paidAt ?? now,
    status: input.status ?? "CONFIRMED",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: context.deviceId,
    paynowTransactionId: input.paynowTransactionId ?? null
  };

  await writeOne("payments", payment);
  await enqueueOperation({ merchantId: context.merchantId, entityType: "payment", opType: "UPSERT", entityId: payment.id, payload: payment });
  await updateOrderTotalsFromPayments(order.id);
  return payment;
}

export async function listStockMovementsLocal() {
  const { merchantId, activeBranchId } = requireSessionContext();
  const [movements, products] = await Promise.all([
    listStoreRows<StockMovement>("stockMovements", merchantId),
    listStoreRows<Product>("products", merchantId)
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));

  return movements
    .filter((movement) => !activeBranchId || movement.branchId === activeBranchId)
    .slice(0, 300)
    .map((movement) => ({
      ...movement,
      product: productById.get(movement.productId) ?? null
    }));
}

export async function getLowStockLocal() {
  const products = await listProductsLocal("", true);
  return { products, lowStockCount: products.length };
}

function inRange(isoValue: string, since: Date) {
  return new Date(isoValue).getTime() >= since.getTime();
}

function buildReturnsExpiredSummary(movements: Array<StockMovement & { product?: Product | null }>, since: Date): ReturnsExpiredSummary {
  const summary: ReturnsExpiredSummary = {
    returnsCount: 0,
    returnsValue: 0,
    expiredCount: 0,
    expiredValue: 0,
    damagedCount: 0,
    damagedValue: 0
  };

  for (const movement of movements) {
    if (!inRange(movement.createdAt, since)) continue;
    const reason = parseAdjustmentReason(movement.reason);
    if (!reason) continue;
    const value = Math.abs(Number(movement.quantity)) * Number(movement.product?.price ?? 0);

    if (reason === "RETURN") {
      summary.returnsCount += Math.abs(Number(movement.quantity));
      summary.returnsValue += value;
      continue;
    }

    if (reason === "EXPIRED") {
      summary.expiredCount += Math.abs(Number(movement.quantity));
      summary.expiredValue += value;
      continue;
    }

    summary.damagedCount += Math.abs(Number(movement.quantity));
    summary.damagedValue += value;
  }

  return summary;
}

export async function getReportsLocal(): Promise<ReportsSummary> {
  const context = requireSessionContext();
  const [payments, orders, items, products, movements] = await Promise.all([
    listStoreRows<Payment>("payments", context.merchantId),
    listStoreRows<Order>("orders", context.merchantId),
    listStoreRows<OrderItem>("orderItems", context.merchantId),
    listStoreRows<Product>("products", context.merchantId),
    listStockMovementsLocal()
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 6);
  const productById = new Map(products.map((product) => [product.id, product]));

  const filteredPayments = payments.filter((payment) => (!context.activeBranchId || payment.branchId === context.activeBranchId) && payment.status === "CONFIRMED");
  const filteredOrders = orders.filter((order) => !context.activeBranchId || order.branchId === context.activeBranchId);
  const filteredItems = items.filter((item) => {
    const order = filteredOrders.find((candidate) => candidate.id === item.orderId);
    return Boolean(order);
  });

  const todaySales = filteredPayments.filter((payment) => inRange(payment.paidAt, todayStart)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const weekSales = filteredPayments.filter((payment) => inRange(payment.paidAt, sevenDaysAgo)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const todayOrders = filteredOrders.filter((order) => inRange(order.createdAt, todayStart)).length;
  const weekOrders = filteredOrders.filter((order) => inRange(order.createdAt, sevenDaysAgo)).length;

  const topProductMap = new Map<string, { productId: string; name: string; qty: number }>();
  for (const item of filteredItems) {
    if (!inRange(item.createdAt, sevenDaysAgo)) continue;
    const product = productById.get(item.productId);
    const current = topProductMap.get(item.productId) ?? {
      productId: item.productId,
      name: product?.name ?? "Deleted product",
      qty: 0
    };
    current.qty += Number(item.quantity);
    topProductMap.set(item.productId, current);
  }

  return {
    salesBasis: "CONFIRMED_PAYMENTS",
    today: {
      salesTotal: todaySales,
      ordersCount: todayOrders
    },
    last7Days: {
      salesTotal: weekSales,
      ordersCount: weekOrders,
      topProducts: [...topProductMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)
    },
    returnsExpired: buildReturnsExpiredSummary(
      movements.map((movement) => ({ ...movement, product: movement.product ?? null })),
      sevenDaysAgo
    )
  };
}

export async function getDashboardLocal() {
  const { merchantId } = requireSessionContext();
  const [reports, orders, lowStock] = await Promise.all([getReportsLocal(), listOrdersLocal(), getLowStockLocal()]);
  const outstanding = orders
    .filter((order) => ORDER_ACTIVE_STATUSES.includes(order.status))
    .reduce((sum, order) => sum + Number(order.total), 0);

  return {
    report: reports,
    orders,
    lowStockCount: lowStock.lowStockCount,
    outstanding,
    merchantId
  };
}

export async function getReceiptLocal(orderId: string): Promise<ReceiptData> {
  const context = requireSessionContext();
  const [details, settings] = await Promise.all([getOrderDetailsLocal(orderId), getSettingsRecord(context.merchantId)]);

  if (!details) {
    throw new Error("Order not found");
  }

  const paynowStatus = details.order.payments.find((payment) => payment.method === "PAYNOW")?.status ?? null;

  return {
    orderId: details.order.id,
    orderNumber: details.order.orderNumber,
    receiptNumber: `RCT-${details.order.orderNumber}`,
    dateTime: details.order.updatedAt,
    businessName: settings.businessName,
    logoPlaceholder: "ZT",
    customerName: details.order.customer?.name || details.order.customerName || "Walk-in",
    items: details.order.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal)
    })),
    totals: {
      subtotal: Number(details.order.subtotal),
      discountAmount: Number(details.order.discountAmount),
      discountPercent: Number(details.order.discountPercent),
      total: Number(details.order.total),
      paid: Number(details.summary.paid),
      balance: Number(details.summary.balance)
    },
    payments: details.order.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: Number(payment.amount),
      reference: payment.reference ?? null,
      status: payment.status,
      paidAt: payment.paidAt
    })),
    paynowStatus,
    qrPayload: details.order.id,
    currencySymbol: settings.currencySymbol
  };
}

export async function buildWhatsappOrderTextLocal(orderId: string) {
  const context = requireSessionContext();
  const [details, settings] = await Promise.all([getOrderDetailsLocal(orderId), getSettingsRecord(context.merchantId)]);
  if (!details) {
    throw new Error("Order not found");
  }

  const lines = details.order.items.map((item) => `${Number(item.quantity)} x ${item.product.name} = ${Number(item.lineTotal).toFixed(2)}`);
  const message = settings.whatsappTemplate
    .replace("{businessName}", settings.businessName)
    .replace("{orderNumber}", details.order.orderNumber)
    .replace("{items}", lines.join("\n"))
    .replace("{total}", `${settings.currencySymbol}${Number(details.order.total).toFixed(2)}`)
    .replace("{balance}", `${settings.currencySymbol}${Number(details.summary.balance).toFixed(2)}`)
    .replace("{paymentInstructions}", settings.paymentInstructions);

  return {
    message,
    phone: details.order.customer?.phone || details.order.customerPhone || null
  };
}

async function pushOutbox(token: string, merchantId: string) {
  const operations = (await readAll<OutboxOperation>("outbox")).filter((operation) => operation.merchantId === merchantId);
  if (operations.length === 0) {
    return { accepted: 0, rejected: [] as Array<{ opId: string; reason: string }>, serverTime: nowIso() };
  }

  const response = await fetch(`${resolveApiBaseUrl()}/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      operations: operations.map(({ merchantId: _merchantId, ...operation }) => operation)
    })
  });

  if (!response.ok) {
    let message = `Sync push failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message || message;
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }

  const result = (await response.json()) as SyncPushResponse;
  await deleteManyOutbox(result.acceptedOpIds);
  return { accepted: result.acceptedOpIds.length, rejected: result.rejected, serverTime: result.serverTime };
}

async function pullChanges(token: string, merchantId: string) {
  const since = getLastPullAt(merchantId);
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const response = await fetch(`${resolveApiBaseUrl()}/sync/pull${query}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    let message = `Sync pull failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message || message;
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }

  const result = (await response.json()) as SyncPullResponse;

  await mergeServerCollection("products", result.changes.products ?? []);
  await mergeServerCollection("customers", result.changes.customers ?? []);
  await mergeServerCollection("orders", result.changes.orders ?? []);
  await mergeServerCollection("orderItems", result.changes.orderItems ?? []);
  await mergeServerCollection("payments", result.changes.payments ?? []);
  await mergeServerCollection("stockMovements", result.changes.stockMovements ?? []);
  await mergeServerCollection("settings", result.changes.settings ?? []);

  setSyncMetadata(merchantId, {
    lastPullAt: result.serverTime,
    lastSyncAt: result.serverTime,
    syncError: null
  });

  const pulledCount =
    (result.changes.products?.length ?? 0) +
    (result.changes.customers?.length ?? 0) +
    (result.changes.orders?.length ?? 0) +
    (result.changes.orderItems?.length ?? 0) +
    (result.changes.payments?.length ?? 0) +
    (result.changes.stockMovements?.length ?? 0) +
    (result.changes.settings?.length ?? 0);

  return { serverTime: result.serverTime, pulledCount };
}

async function mergeServerCollection<T extends { id: string; updatedAt: string }>(storeName: OfflineStoreName, rows: T[]) {
  if (rows.length === 0) return;
  const nextRows: T[] = [];
  for (const row of rows) {
    const existing = await readById<T & { updatedAt: string }>(storeName, row.id);
    if (!existing || shouldApplyServerRecord(existing.updatedAt, row.updatedAt)) {
      nextRows.push(row);
    }
  }
  await writeMany(storeName, nextRows);
}

export async function syncOfflineCore(token: string, merchantId: string) {
  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    if (!isBrowserOnline()) {
      const error = new Error("Offline");
      setSyncMetadata(merchantId, { syncError: error.message });
      throw error;
    }

    try {
      const pushed = await pushOutbox(token, merchantId);
      const pulled = await pullChanges(token, merchantId);
      setSyncMetadata(merchantId, {
        lastSyncAt: pulled.serverTime,
        lastPullAt: pulled.serverTime,
        syncError: pushed.rejected.length ? pushed.rejected[0]?.reason ?? null : null
      });
      return {
        serverTime: pulled.serverTime,
        pushed: pushed.accepted,
        pulled: pulled.pulledCount
      };
    } catch (error) {
      setSyncMetadata(merchantId, { syncError: error instanceof Error ? error.message : "Sync failed" });
      throw error;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

export async function hydrateOfflineCore(token: string, merchantId: string) {
  try {
    return await syncOfflineCore(token, merchantId);
  } catch (error) {
    if (isNetworkError(error)) {
      return { serverTime: getLastPullAt(merchantId) ?? nowIso(), pushed: 0, pulled: 0 };
    }
    throw error;
  }
}

export async function hasOfflineCoreData(merchantId: string) {
  const [products, customers, orders, settings] = await Promise.all([
    listStoreRows<Product>("products", merchantId),
    listStoreRows<Customer>("customers", merchantId),
    listStoreRows<Order>("orders", merchantId),
    listStoreRows<Settings>("settings", merchantId)
  ]);

  return products.length > 0 || customers.length > 0 || orders.length > 0 || settings.length > 0;
}

export function onlinePaymentsMessage() {
  return "Online payments require internet";
}

export function manualPaymentMethods() {
  return MANUAL_PAYMENT_METHODS;
}
