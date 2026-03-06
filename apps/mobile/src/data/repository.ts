import { SyncPullResponse } from "@novoriq/shared";
import { getDb } from "./database";
import { generateId } from "../utils/id";
import { defaultFeatureFlags } from "../constants/featureFlags";

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
  method: "CASH" | "ECOCASH" | "ZIPIT" | "BANK_TRANSFER" | "OTHER" | "PAYNOW";
  reference?: string | null;
  paidAt?: string;
  status?: "PENDING" | "CONFIRMED";
  paynowTransactionId?: string | null;
};

type SessionContext = {
  merchantId: string;
  deviceId: string;
};

type OutboxRow = {
  op_id: string;
  entity_type: string;
  op_type: string;
  entity_id: string;
  payload: string;
  created_at: string;
};

type SyncState = {
  last_pull_at: string | null;
  last_push_at: string | null;
  last_error: string | null;
  device_id: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toCamel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value
    ])
  );
}

function normalizeOrderStatus(status: string): string {
  if (["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(status)) {
    return status;
  }
  return "DRAFT";
}

async function enqueue(
  entityType: string,
  entityId: string,
  opType: "UPSERT" | "DELETE",
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO outbox (id, op_id, entity_type, entity_id, op_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
    [generateId(), generateId(), entityType, entityId, opType, JSON.stringify(payload), nowIso()]
  );
}

async function getSyncStateRow(): Promise<SyncState> {
  const db = await getDb();
  const state = await db.getFirstAsync<SyncState>(
    "SELECT last_pull_at, last_push_at, last_error, device_id FROM sync_state WHERE id = 1;"
  );

  if (!state) {
    const init: SyncState = {
      last_pull_at: null,
      last_push_at: null,
      last_error: null,
      device_id: "device-unset"
    };
    await db.runAsync(
      "INSERT INTO sync_state (id, last_pull_at, last_push_at, last_error, device_id) VALUES (1, NULL, NULL, NULL, ?);",
      [init.device_id]
    );
    return init;
  }

  return state;
}

export async function initializeLocalStore(deviceId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_state SET device_id = ? WHERE id = 1;", [deviceId]);
  for (const [key, enabled] of Object.entries(defaultFeatureFlags)) {
    await db.runAsync(
      "INSERT OR IGNORE INTO feature_flags (id, key, enabled, merchant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);",
      [generateId(), key, enabled ? 1 : 0, null, nowIso(), nowIso()]
    );
  }
}

export async function getDeviceId(): Promise<string> {
  const state = await getSyncStateRow();
  if (state.device_id && state.device_id !== "device-unset") {
    return state.device_id;
  }
  const deviceId = `device-${generateId()}`;
  await initializeLocalStore(deviceId);
  return deviceId;
}

export async function getSyncState(): Promise<SyncState> {
  return getSyncStateRow();
}

export async function setSyncState(values: Partial<{ lastPullAt: string; lastPushAt: string; lastError: string | null }>) {
  const db = await getDb();
  if (values.lastPullAt !== undefined) {
    await db.runAsync("UPDATE sync_state SET last_pull_at = ? WHERE id = 1;", [values.lastPullAt]);
  }
  if (values.lastPushAt !== undefined) {
    await db.runAsync("UPDATE sync_state SET last_push_at = ? WHERE id = 1;", [values.lastPushAt]);
  }
  if (values.lastError !== undefined) {
    await db.runAsync("UPDATE sync_state SET last_error = ? WHERE id = 1;", [values.lastError]);
  }
}

export async function listOutbox(limit = 200): Promise<
  Array<{
    opId: string;
    entityType: string;
    opType: "UPSERT" | "DELETE";
    entityId: string;
    payload: Record<string, unknown>;
    clientUpdatedAt: string;
  }>
> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT op_id, entity_type, op_type, entity_id, payload, created_at FROM outbox ORDER BY created_at ASC LIMIT ?;",
    [limit]
  );

  return rows.map((row) => ({
    opId: row.op_id,
    entityType: row.entity_type,
    opType: row.op_type as "UPSERT" | "DELETE",
    entityId: row.entity_id,
    payload: JSON.parse(row.payload),
    clientUpdatedAt: row.created_at
  }));
}

export async function ackOutbox(opIds: string[]): Promise<void> {
  if (opIds.length === 0) return;
  const db = await getDb();
  const placeholders = opIds.map(() => "?").join(",");
  await db.runAsync(`DELETE FROM outbox WHERE op_id IN (${placeholders});`, opIds);
}

async function getProductById(merchantId: string, id: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM products WHERE merchant_id = ? AND id = ?;",
    [merchantId, id]
  );
  return row ? toCamel(row) : null;
}

export async function listProducts(merchantId: string, search = "", lowStockOnly = false): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM products
     WHERE merchant_id = ?
       AND deleted_at IS NULL
       AND (? = '' OR LOWER(name) LIKE '%' || LOWER(?) || '%' OR LOWER(COALESCE(sku, '')) LIKE '%' || LOWER(?) || '%')
     ORDER BY updated_at DESC;`,
    [merchantId, search, search, search]
  );

  const mapped = rows.map((row) => toCamel(row));
  if (!lowStockOnly) return mapped;
  return mapped.filter((item) => Number(item.stockQty) <= Number(item.lowStockThreshold));
}

export async function saveProduct(context: SessionContext, input: SaveProductInput): Promise<Record<string, unknown>> {
  const db = await getDb();
  const id = input.id ?? generateId();
  const existing = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM products WHERE merchant_id = ? AND id = ?;",
    [context.merchantId, id]
  );

  const version = existing ? existing.version + 1 : 1;
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO products (
      id, merchant_id, name, price, cost, sku, stock_qty, low_stock_threshold,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      cost = excluded.cost,
      sku = excluded.sku,
      stock_qty = excluded.stock_qty,
      low_stock_threshold = excluded.low_stock_threshold,
      updated_at = excluded.updated_at,
      deleted_at = NULL,
      version = excluded.version,
      last_modified_by_device_id = excluded.last_modified_by_device_id;`,
    [
      id,
      context.merchantId,
      input.name,
      input.price,
      input.cost ?? null,
      input.sku ?? null,
      input.stockQty,
      input.lowStockThreshold,
      now,
      now,
      version,
      context.deviceId
    ]
  );

  const product = (await getProductById(context.merchantId, id))!;
  await enqueue("product", id, "UPSERT", product);
  return product;
}

export async function deleteProduct(context: SessionContext, productId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `UPDATE products
     SET deleted_at = ?, updated_at = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, now, context.deviceId, context.merchantId, productId]
  );

  const product = await getProductById(context.merchantId, productId);
  if (product) {
    await enqueue("product", productId, "DELETE", product);
  }
}

export async function adjustStock(
  context: SessionContext,
  productId: string,
  quantity: number,
  reason?: string
): Promise<void> {
  const product = await getProductById(context.merchantId, productId);
  if (!product) {
    return;
  }

  const nextQty = Number(product.stockQty) + quantity;
  const updated = await saveProduct(context, {
    id: productId,
    name: String(product.name),
    price: Number(product.price),
    cost: product.cost === null ? null : Number(product.cost),
    sku: product.sku ? String(product.sku) : null,
    stockQty: nextQty,
    lowStockThreshold: Number(product.lowStockThreshold)
  });

  const db = await getDb();
  const now = nowIso();
  const movementId = generateId();
  const type = "ADJUSTMENT";

  await db.runAsync(
    `INSERT INTO stock_movements (
      id, merchant_id, product_id, type, quantity, reason, order_id,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, ?);`,
    [movementId, context.merchantId, productId, type, quantity, reason ?? "Manual adjustment", now, now, context.deviceId]
  );

  const movement = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM stock_movements WHERE id = ?;",
    [movementId]
  );

  if (movement) {
    await enqueue("stockMovement", movementId, "UPSERT", toCamel(movement));
  }

  await enqueue("product", productId, "UPSERT", updated);
}

async function getCustomerById(merchantId: string, id: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM customers WHERE merchant_id = ? AND id = ?;",
    [merchantId, id]
  );
  return row ? toCamel(row) : null;
}

export async function listCustomers(merchantId: string, search = ""): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM customers
     WHERE merchant_id = ?
       AND deleted_at IS NULL
       AND (? = '' OR LOWER(name) LIKE '%' || LOWER(?) || '%' OR LOWER(COALESCE(phone, '')) LIKE '%' || LOWER(?) || '%')
     ORDER BY updated_at DESC;`,
    [merchantId, search, search, search]
  );

  return rows.map((row) => toCamel(row));
}

export async function saveCustomer(context: SessionContext, input: SaveCustomerInput): Promise<Record<string, unknown>> {
  const db = await getDb();
  const id = input.id ?? generateId();
  const existing = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM customers WHERE merchant_id = ? AND id = ?;",
    [context.merchantId, id]
  );
  const version = existing ? existing.version + 1 : 1;
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO customers (
      id, merchant_id, name, phone, notes, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      deleted_at = NULL,
      version = excluded.version,
      last_modified_by_device_id = excluded.last_modified_by_device_id;`,
    [id, context.merchantId, input.name, input.phone ?? null, input.notes ?? null, now, now, version, context.deviceId]
  );

  const customer = (await getCustomerById(context.merchantId, id))!;
  await enqueue("customer", id, "UPSERT", customer);
  return customer;
}

export async function deleteCustomer(context: SessionContext, customerId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE customers SET deleted_at = ?, updated_at = ?, version = version + 1, last_modified_by_device_id = ? WHERE merchant_id = ? AND id = ?;",
    [now, now, context.deviceId, context.merchantId, customerId]
  );

  const customer = await getCustomerById(context.merchantId, customerId);
  if (customer) {
    await enqueue("customer", customerId, "DELETE", customer);
  }
}

function generateOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `NVO-${stamp}-${rand}`;
}

async function getOrderById(merchantId: string, orderId: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM orders WHERE merchant_id = ? AND id = ?;",
    [merchantId, orderId]
  );
  return row ? toCamel(row) : null;
}

export async function listOrders(merchantId: string, search = ""): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT o.*,
            c.name as customer_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.merchant_id = ?
       AND o.deleted_at IS NULL
       AND (? = '' OR LOWER(o.order_number) LIKE '%' || LOWER(?) || '%' OR LOWER(COALESCE(c.name, '')) LIKE '%' || LOWER(?) || '%')
     ORDER BY o.updated_at DESC;`,
    [merchantId, search, search, search]
  );

  return rows.map((row) => toCamel(row));
}

export async function createOrder(context: SessionContext, input: CreateOrderInput): Promise<Record<string, unknown>> {
  const db = await getDb();
  const now = nowIso();
  const orderId = generateId();
  const orderNumber = generateOrderNumber();

  let subtotal = 0;
  for (const item of input.items) {
    const product = await db.getFirstAsync<{ price: number }>(
      "SELECT price FROM products WHERE merchant_id = ? AND id = ? AND deleted_at IS NULL;",
      [context.merchantId, item.productId]
    );

    if (!product) {
      throw new Error("Product unavailable for order");
    }

    subtotal += Number(product.price) * item.quantity;
  }

  const discountPercent = input.discountPercent ?? 0;
  const discountAmount = input.discountAmount ?? subtotal * (discountPercent / 100);
  const total = Math.max(subtotal - discountAmount, 0);

  await db.runAsync(
    `INSERT INTO orders (
      id, merchant_id, customer_id, order_number, status, subtotal, discount_amount, discount_percent,
      total, notes, confirmed_at, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, ?);`,
    [
      orderId,
      context.merchantId,
      input.customerId ?? null,
      orderNumber,
      "DRAFT",
      subtotal,
      discountAmount,
      discountPercent,
      total,
      input.notes ?? null,
      now,
      now,
      context.deviceId
    ]
  );

  for (const item of input.items) {
    const product = await db.getFirstAsync<{ price: number }>(
      "SELECT price FROM products WHERE merchant_id = ? AND id = ?;",
      [context.merchantId, item.productId]
    );

    if (!product) continue;

    const lineTotal = Number(product.price) * item.quantity;

    await db.runAsync(
      `INSERT INTO order_items (
        id, merchant_id, order_id, product_id, quantity, unit_price, line_total,
        created_at, updated_at, deleted_at, version, last_modified_by_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
      [generateId(), context.merchantId, orderId, item.productId, item.quantity, Number(product.price), lineTotal, now, now, context.deviceId]
    );
  }

  const order = (await getOrderById(context.merchantId, orderId))!;
  await enqueue("order", orderId, "UPSERT", order);

  const items = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM order_items WHERE merchant_id = ? AND order_id = ? AND deleted_at IS NULL;",
    [context.merchantId, orderId]
  );

  for (const item of items) {
    await enqueue("orderItem", String(item.id), "UPSERT", toCamel(item));
  }

  return order;
}

export async function getOrderDetails(
  merchantId: string,
  orderId: string
): Promise<{
  order: Record<string, unknown>;
  items: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  paid: number;
  balance: number;
} | null> {
  const db = await getDb();
  const orderRow = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT o.*, c.name as customer_name, c.phone as customer_phone
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.merchant_id = ? AND o.id = ? AND o.deleted_at IS NULL;`,
    [merchantId, orderId]
  );

  if (!orderRow) return null;

  const items = await db.getAllAsync<Record<string, unknown>>(
    `SELECT oi.*, p.name as product_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.merchant_id = ? AND oi.order_id = ? AND oi.deleted_at IS NULL
     ORDER BY oi.created_at ASC;`,
    [merchantId, orderId]
  );

  const payments = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM payments
     WHERE merchant_id = ? AND order_id = ? AND deleted_at IS NULL
     ORDER BY paid_at DESC;`,
    [merchantId, orderId]
  );

  const paid = payments
    .map((row) => toCamel(row))
    .filter((payment) => payment.status === "CONFIRMED")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const order = toCamel(orderRow);

  return {
    order,
    items: items.map((row) => toCamel(row)),
    payments: payments.map((row) => toCamel(row)),
    paid,
    balance: Number(order.total) - paid
  };
}

async function enqueueOrderById(context: SessionContext, orderId: string) {
  const order = await getOrderById(context.merchantId, orderId);
  if (order) {
    await enqueue("order", orderId, "UPSERT", order);
  }
}

async function createStockMovement(
  context: SessionContext,
  productId: string,
  type: "IN" | "OUT" | "ADJUSTMENT",
  quantity: number,
  reason: string,
  orderId?: string | null
) {
  const db = await getDb();
  const now = nowIso();
  const movementId = generateId();

  await db.runAsync(
    `INSERT INTO stock_movements (
      id, merchant_id, product_id, type, quantity, reason, order_id,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
    [
      movementId,
      context.merchantId,
      productId,
      type,
      quantity,
      reason,
      orderId ?? null,
      now,
      now,
      context.deviceId
    ]
  );

  const movement = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM stock_movements WHERE id = ?;",
    [movementId]
  );
  if (movement) {
    await enqueue("stockMovement", movementId, "UPSERT", toCamel(movement));
  }
}

export async function updateOrderStatus(context: SessionContext, orderId: string, status: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `UPDATE orders
     SET status = ?, updated_at = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [normalizeOrderStatus(status), now, context.deviceId, context.merchantId, orderId]
  );
  await enqueueOrderById(context, orderId);
}

export async function confirmOrder(context: SessionContext, orderId: string): Promise<void> {
  const db = await getDb();
  const order = await getOrderById(context.merchantId, orderId);
  if (!order) return;
  if (["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(String(order.status))) return;

  const now = nowIso();
  await db.runAsync(
    `UPDATE orders
     SET status = 'CONFIRMED', confirmed_at = ?, updated_at = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, now, context.deviceId, context.merchantId, orderId]
  );

  const items = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM order_items WHERE merchant_id = ? AND order_id = ? AND deleted_at IS NULL;",
    [context.merchantId, orderId]
  );

  for (const row of items) {
    const item = toCamel(row);
    const product = await getProductById(context.merchantId, String(item.productId));
    if (!product) continue;

    await saveProduct(context, {
      id: String(product.id),
      name: String(product.name),
      price: Number(product.price),
      cost: product.cost === null ? null : Number(product.cost),
      sku: product.sku ? String(product.sku) : null,
      stockQty: Number(product.stockQty) - Number(item.quantity),
      lowStockThreshold: Number(product.lowStockThreshold)
    });

    await createStockMovement(
      context,
      String(item.productId),
      "OUT",
      -Number(item.quantity),
      `Order confirmed ${String(order.orderNumber)}`,
      orderId
    );
  }

  await enqueueOrderById(context, orderId);
}

export async function cancelOrder(context: SessionContext, orderId: string): Promise<void> {
  const db = await getDb();
  const order = await getOrderById(context.merchantId, orderId);
  if (!order) return;
  if (order.status === "CANCELLED") return;

  const wasConfirmed = ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(String(order.status));
  const now = nowIso();

  await db.runAsync(
    `UPDATE orders
     SET status = 'CANCELLED', updated_at = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, context.deviceId, context.merchantId, orderId]
  );

  if (wasConfirmed) {
    const items = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM order_items WHERE merchant_id = ? AND order_id = ? AND deleted_at IS NULL;",
      [context.merchantId, orderId]
    );

    for (const row of items) {
      const item = toCamel(row);
      const product = await getProductById(context.merchantId, String(item.productId));
      if (!product) continue;

      await saveProduct(context, {
        id: String(product.id),
        name: String(product.name),
        price: Number(product.price),
        cost: product.cost === null ? null : Number(product.cost),
        sku: product.sku ? String(product.sku) : null,
        stockQty: Number(product.stockQty) + Number(item.quantity),
        lowStockThreshold: Number(product.lowStockThreshold)
      });

      await createStockMovement(
        context,
        String(item.productId),
        "IN",
        Number(item.quantity),
        `Order cancelled ${String(order.orderNumber)}`,
        orderId
      );
    }
  }

  await enqueueOrderById(context, orderId);
}

async function updateOrderPaymentStatus(context: SessionContext, orderId: string): Promise<void> {
  const db = await getDb();
  const details = await getOrderDetails(context.merchantId, orderId);
  if (!details) return;

  const order = details.order;
  if (order.status === "CANCELLED") return;

  let nextStatus = String(order.status);
  if (details.paid <= 0) {
    if (["PAID", "PARTIALLY_PAID"].includes(nextStatus)) {
      nextStatus = "CONFIRMED";
    }
  } else if (details.paid >= Number(order.total)) {
    nextStatus = "PAID";
  } else if (details.paid > 0) {
    nextStatus = "PARTIALLY_PAID";
  }

  if (nextStatus !== order.status) {
    await updateOrderStatus(context, String(order.id), nextStatus);
  }
}

export async function addPayment(context: SessionContext, input: AddPaymentInput): Promise<Record<string, unknown>> {
  const db = await getDb();
  const now = nowIso();
  const id = generateId();
  const paidAt = input.paidAt ?? now;
  const status = input.status ?? "CONFIRMED";

  await db.runAsync(
    `INSERT INTO payments (
      id, merchant_id, order_id, amount, method, reference, paid_at,
      status, paynow_transaction_id, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
    [
      id,
      context.merchantId,
      input.orderId,
      input.amount,
      input.method,
      input.reference ?? null,
      paidAt,
      status,
      input.paynowTransactionId ?? null,
      now,
      now,
      context.deviceId
    ]
  );

  const paymentRow = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM payments WHERE id = ?;",
    [id]
  );

  if (!paymentRow) {
    throw new Error("Failed to create payment");
  }

  const payment = toCamel(paymentRow);
  await enqueue("payment", id, "UPSERT", payment);

  await updateOrderPaymentStatus(context, input.orderId);

  return payment;
}

export async function listStockMovements(merchantId: string): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT sm.*, p.name as product_name
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.merchant_id = ? AND sm.deleted_at IS NULL
     ORDER BY sm.created_at DESC
     LIMIT 300;`,
    [merchantId]
  );

  return rows.map((row) => toCamel(row));
}

export async function getDashboardStats(merchantId: string): Promise<{
  todaySalesTotal: number;
  todayOrdersCount: number;
  outstandingTotal: number;
  lowStockCount: number;
}> {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = today.toISOString();

  const todaySales = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payments
     WHERE merchant_id = ? AND deleted_at IS NULL AND status = 'CONFIRMED' AND paid_at >= ?;`,
    [merchantId, since]
  );

  const todayOrders = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM orders
     WHERE merchant_id = ? AND deleted_at IS NULL AND created_at >= ?;`,
    [merchantId, since]
  );

  const outstanding = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total), 0) as total
     FROM orders
     WHERE merchant_id = ? AND deleted_at IS NULL AND status IN ('DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_PAID');`,
    [merchantId]
  );

  const lowStock = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM products
     WHERE merchant_id = ? AND deleted_at IS NULL AND stock_qty <= low_stock_threshold;`,
    [merchantId]
  );

  return {
    todaySalesTotal: Number(todaySales?.total ?? 0),
    todayOrdersCount: Number(todayOrders?.count ?? 0),
    outstandingTotal: Number(outstanding?.total ?? 0),
    lowStockCount: Number(lowStock?.count ?? 0)
  };
}

export async function getReports(merchantId: string): Promise<{
  salesBasis: string;
  today: { salesTotal: number; ordersCount: number };
  last7Days: { salesTotal: number; ordersCount: number; topProducts: Array<{ productId: string; name: string; qty: number }> };
}> {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  const [todaySales, weekSales, todayOrders, weekOrders, topRows] = await Promise.all([
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments
       WHERE merchant_id = ? AND deleted_at IS NULL AND status = 'CONFIRMED' AND paid_at >= ?;`,
      [merchantId, today.toISOString()]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments
       WHERE merchant_id = ? AND deleted_at IS NULL AND status = 'CONFIRMED' AND paid_at >= ?;`,
      [merchantId, sevenDaysAgo.toISOString()]
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders
       WHERE merchant_id = ? AND deleted_at IS NULL AND created_at >= ?;`,
      [merchantId, today.toISOString()]
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders
       WHERE merchant_id = ? AND deleted_at IS NULL AND created_at >= ?;`,
      [merchantId, sevenDaysAgo.toISOString()]
    ),
    db.getAllAsync<{ product_id: string; product_name: string; qty: number }>(
      `SELECT oi.product_id, p.name as product_name, SUM(oi.quantity) as qty
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.merchant_id = ? AND oi.deleted_at IS NULL AND oi.created_at >= ?
       GROUP BY oi.product_id, p.name
       ORDER BY qty DESC
       LIMIT 5;`,
      [merchantId, sevenDaysAgo.toISOString()]
    )
  ]);

  return {
    salesBasis: "CONFIRMED_PAYMENTS",
    today: {
      salesTotal: Number(todaySales?.total ?? 0),
      ordersCount: Number(todayOrders?.count ?? 0)
    },
    last7Days: {
      salesTotal: Number(weekSales?.total ?? 0),
      ordersCount: Number(weekOrders?.count ?? 0),
      topProducts: topRows.map((row) => ({
        productId: row.product_id,
        name: row.product_name,
        qty: Number(row.qty)
      }))
    }
  };
}

export async function getSettings(merchantId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const existing = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM settings WHERE merchant_id = ? AND deleted_at IS NULL;",
    [merchantId]
  );

  if (existing) {
    return toCamel(existing);
  }

  const now = nowIso();
  const setting = {
    id: generateId(),
    merchant_id: merchantId,
    business_name: "My Business",
    currency_code: "USD",
    currency_symbol: "$",
    payment_instructions: "EcoCash / ZIPIT / Bank transfer / Cash",
    whatsapp_template:
      "{businessName}\\nOrder #{orderNumber}\\n{items}\\nTotal: {total}\\nBalance: {balance}\\nPayment: {paymentInstructions}\\nThank you.",
    support_phone: "+263770000000",
    support_email: "support@example.com",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    version: 1,
    last_modified_by_device_id: "local-default"
  };

  await db.runAsync(
    `INSERT INTO settings (
      id, merchant_id, business_name, currency_code, currency_symbol, payment_instructions,
      whatsapp_template, support_phone, support_email, created_at, updated_at, deleted_at,
      version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);`,
    [
      setting.id,
      setting.merchant_id,
      setting.business_name,
      setting.currency_code,
      setting.currency_symbol,
      setting.payment_instructions,
      setting.whatsapp_template,
      setting.support_phone,
      setting.support_email,
      setting.created_at,
      setting.updated_at,
      setting.version,
      setting.last_modified_by_device_id
    ]
  );

  return toCamel(setting);
}

export async function saveSettings(
  context: SessionContext,
  input: Partial<{
    businessName: string;
    currencyCode: "USD" | "ZWL";
    currencySymbol: string;
    paymentInstructions: string;
    whatsappTemplate: string;
    supportPhone: string | null;
    supportEmail: string | null;
  }>
): Promise<Record<string, unknown>> {
  const db = await getDb();
  const current = await getSettings(context.merchantId);
  const next = {
    ...current,
    ...input,
    id: String(current.id),
    merchantId: context.merchantId,
    updatedAt: nowIso(),
    version: Number(current.version) + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await db.runAsync(
    `UPDATE settings SET
      business_name = ?,
      currency_code = ?,
      currency_symbol = ?,
      payment_instructions = ?,
      whatsapp_template = ?,
      support_phone = ?,
      support_email = ?,
      updated_at = ?,
      version = ?,
      last_modified_by_device_id = ?
     WHERE merchant_id = ?;`,
    [
      String(next.businessName ?? ""),
      (next.currencyCode === "ZWL" ? "ZWL" : "USD") as "USD" | "ZWL",
      String(next.currencySymbol ?? "$"),
      String(next.paymentInstructions ?? ""),
      String(next.whatsappTemplate ?? ""),
      next.supportPhone ?? null,
      next.supportEmail ?? null,
      String(next.updatedAt),
      next.version,
      String(next.lastModifiedByDeviceId),
      context.merchantId
    ] as any[]
  );

  const updated = await getSettings(context.merchantId);
  await enqueue("settings", String(updated.id), "UPSERT", updated);
  return updated;
}

export async function getFeatureFlags(merchantId: string): Promise<Record<string, boolean>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; enabled: number }>(
    `SELECT key, enabled FROM feature_flags
     WHERE merchant_id IS NULL OR merchant_id = ?;`,
    [merchantId]
  );

  const map: Record<string, boolean> = { ...defaultFeatureFlags };
  for (const row of rows) {
    map[row.key] = row.enabled === 1;
  }
  return map;
}

export async function setFeatureFlag(context: SessionContext, key: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM feature_flags WHERE key = ? AND merchant_id = ?;",
    [key, context.merchantId]
  );

  const id = existing?.id ?? generateId();

  await db.runAsync(
    `INSERT INTO feature_flags (id, key, enabled, merchant_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at;`,
    [id, key, enabled ? 1 : 0, context.merchantId, now, now]
  );

  await enqueue("featureFlag", id, "UPSERT", {
    id,
    key,
    enabled,
    merchantId: context.merchantId,
    createdAt: now,
    updatedAt: now
  });
}

export async function buildWhatsappOrderText(
  merchantId: string,
  orderId: string
): Promise<{ message: string; phone?: string }> {
  const details = await getOrderDetails(merchantId, orderId);
  if (!details) {
    throw new Error("Order not found");
  }

  const settings = await getSettings(merchantId);
  const symbol = String(settings.currencySymbol ?? "$");
  const format = (value: number) => `${symbol}${value.toFixed(2)}`;

  const itemLines = details.items
    .map((item) => `${Number(item.quantity)}x ${String(item.productName)} @ ${format(Number(item.unitPrice))} = ${format(Number(item.lineTotal))}`)
    .join("\n");

  const template = String(settings.whatsappTemplate);
  const message = template
    .replace("{businessName}", String(settings.businessName))
    .replace("{orderNumber}", String(details.order.orderNumber))
    .replace("{items}", itemLines)
    .replace("{total}", format(Number(details.order.total)))
    .replace("{balance}", format(Number(details.balance)))
    .replace("{paymentInstructions}", String(settings.paymentInstructions));

  return {
    message,
    phone: details.order.customerPhone ? String(details.order.customerPhone) : undefined
  };
}

async function mergeRow(
  table: string,
  merchantId: string,
  row: Record<string, unknown>,
  columns: string[],
  values: any[]
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ updated_at: string }>(
    `SELECT updated_at FROM ${table} WHERE id = ? AND merchant_id = ?;`,
    [String(row.id ?? ""), merchantId]
  );

  if (existing && new Date(existing.updated_at).getTime() > new Date(String(row.updatedAt)).getTime()) {
    return;
  }

  const placeholders = columns.map(() => "?").join(",");
  const updates = columns
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates};`,
    values as any[]
  );
}

export async function applySyncChanges(
  merchantId: string,
  changes: SyncPullResponse["changes"]
): Promise<void> {
  for (const row of changes.products) {
    await mergeRow(
      "products",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "name",
        "price",
        "cost",
        "sku",
        "stock_qty",
        "low_stock_threshold",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.name,
        row.price,
        row.cost,
        row.sku,
        row.stockQty,
        row.lowStockThreshold,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.customers) {
    await mergeRow(
      "customers",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "name",
        "phone",
        "notes",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.name,
        row.phone,
        row.notes,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.orders) {
    await mergeRow(
      "orders",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "customer_id",
        "order_number",
        "status",
        "subtotal",
        "discount_amount",
        "discount_percent",
        "total",
        "notes",
        "confirmed_at",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.customerId,
        row.orderNumber,
        row.status,
        row.subtotal,
        row.discountAmount,
        row.discountPercent,
        row.total,
        row.notes,
        row.confirmedAt,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.orderItems) {
    await mergeRow(
      "order_items",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "order_id",
        "product_id",
        "quantity",
        "unit_price",
        "line_total",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.orderId,
        row.productId,
        row.quantity,
        row.unitPrice,
        row.lineTotal,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.payments) {
    await mergeRow(
      "payments",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "order_id",
        "amount",
        "method",
        "reference",
        "paid_at",
        "status",
        "paynow_transaction_id",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.orderId,
        row.amount,
        row.method,
        row.reference,
        row.paidAt,
        row.status,
        row.paynowTransactionId,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.stockMovements) {
    await mergeRow(
      "stock_movements",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "product_id",
        "type",
        "quantity",
        "reason",
        "order_id",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.productId,
        row.type,
        row.quantity,
        row.reason,
        row.orderId,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.settings) {
    await mergeRow(
      "settings",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "business_name",
        "currency_code",
        "currency_symbol",
        "payment_instructions",
        "whatsapp_template",
        "support_phone",
        "support_email",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.businessName,
        row.currencyCode,
        row.currencySymbol,
        row.paymentInstructions,
        row.whatsappTemplate,
        row.supportPhone,
        row.supportEmail,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  const db = await getDb();
  for (const row of changes.featureFlags ?? []) {
    await db.runAsync(
      `INSERT INTO feature_flags (id, key, enabled, merchant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         key = excluded.key,
         enabled = excluded.enabled,
         merchant_id = excluded.merchant_id,
         updated_at = excluded.updated_at;`,
      [row.id, row.key, row.enabled ? 1 : 0, row.merchantId ?? null, row.createdAt, row.updatedAt]
    );
  }
}

export async function resetLocalData(): Promise<void> {
  const db = await getDb();
  await db.execAsync("DELETE FROM outbox;");
  await db.execAsync("DELETE FROM products;");
  await db.execAsync("DELETE FROM customers;");
  await db.execAsync("DELETE FROM orders;");
  await db.execAsync("DELETE FROM order_items;");
  await db.execAsync("DELETE FROM payments;");
  await db.execAsync("DELETE FROM stock_movements;");
  await db.execAsync("DELETE FROM settings;");
}

type LocalBackupPayload = {
  version: string;
  exportedAt: string;
  data: {
    settings: Record<string, unknown>[];
    products: Record<string, unknown>[];
    customers: Record<string, unknown>[];
    orders: Record<string, unknown>[];
    orderItems: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    stockMovements: Record<string, unknown>[];
    featureFlags: Record<string, unknown>[];
  };
};

async function selectAsCamel(sql: string, params: any[]): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(sql, params as any[]);
  return rows.map((row) => toCamel(row));
}

function forceMerchant(rows: Record<string, unknown>[], merchantId: string): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    merchantId
  }));
}

export async function exportLocalBackup(merchantId: string): Promise<LocalBackupPayload> {
  const [settings, products, customers, orders, orderItems, payments, stockMovements, featureFlags] = await Promise.all([
    selectAsCamel("SELECT * FROM settings WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM products WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM customers WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM orders WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM order_items WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM payments WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM stock_movements WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM feature_flags WHERE merchant_id = ?;", [merchantId])
  ]);

  return {
    version: "2.0.0-local",
    exportedAt: nowIso(),
    data: {
      settings,
      products,
      customers,
      orders,
      orderItems,
      payments,
      stockMovements,
      featureFlags
    }
  };
}

export async function importLocalBackup(context: SessionContext, backup: Record<string, unknown>): Promise<void> {
  const data = (backup.data ?? backup) as Record<string, unknown>;

  const changes: SyncPullResponse["changes"] = {
    products: forceMerchant(Array.isArray(data.products) ? (data.products as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["products"],
    customers: forceMerchant(Array.isArray(data.customers) ? (data.customers as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["customers"],
    orders: forceMerchant(Array.isArray(data.orders) ? (data.orders as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["orders"],
    orderItems: forceMerchant(Array.isArray(data.orderItems) ? (data.orderItems as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["orderItems"],
    payments: forceMerchant(Array.isArray(data.payments) ? (data.payments as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["payments"],
    stockMovements: forceMerchant(
      Array.isArray(data.stockMovements) ? (data.stockMovements as Record<string, unknown>[]) : [],
      context.merchantId
    ) as SyncPullResponse["changes"]["stockMovements"],
    settings: forceMerchant(Array.isArray(data.settings) ? (data.settings as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["settings"],
    featureFlags: Array.isArray(data.featureFlags) ? (data.featureFlags as SyncPullResponse["changes"]["featureFlags"]) : []
  };

  await applySyncChanges(context.merchantId, changes);
  await setSyncState({ lastError: null });
}
