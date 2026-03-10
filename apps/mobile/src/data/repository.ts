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
  categoryId?: string | null;
  stockQty: number;
  lowStockThreshold: number;
};

type SaveCategoryInput = {
  id?: string;
  name: string;
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

type InventoryAdjustmentReason = "RETURN" | "EXPIRED" | "DAMAGED";

type RecordInventoryAdjustmentInput = {
  productId: string;
  quantity: number;
  reason: InventoryAdjustmentReason;
  notes?: string | null;
  orderId?: string | null;
  occurredAt?: string;
};

type SessionContext = {
  merchantId: string;
  userId: string;
  deviceId: string;
};

type OutboxRow = {
  op_id: string;
  entity_type: string;
  op_type: string;
  entity_id: string;
  payload: string;
  user_id: string | null;
  device_id: string | null;
  created_at: string;
};

type SyncState = {
  last_pull_at: string | null;
  last_push_at: string | null;
  last_error: string | null;
  device_id: string;
};

type LocalCategoryRow = Record<string, unknown> & {
  id: string;
  name: string;
};

type LocalProductRow = Record<string, unknown> & {
  id: string;
  name: string;
  categoryId?: string | null;
  category?: string | null;
  categoryName?: string | null;
  price?: number;
  cost?: number | null;
  stockQty?: number;
  lowStockThreshold?: number;
};

type SettingsRowInput = {
  id: string;
  merchantId: string;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  businessName: string;
  currencyCode: "USD" | "ZWL";
  currencySymbol: string;
  paymentInstructions: string;
  whatsappTemplate: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version: number;
  lastModifiedByDeviceId: string;
};

const settingsInitLocks = new Map<string, Promise<Record<string, unknown>>>();

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

function formatAdjustmentReason(reason: InventoryAdjustmentReason, notes?: string | null) {
  return notes?.trim() ? `${reason}: ${notes.trim()}` : reason;
}

function confirmedAtForStatus(status: string, current: string | null | undefined, fallback: string) {
  if (["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(status)) {
    return current ?? fallback;
  }
  return null;
}

function parseAdjustmentReason(reason: string | null | undefined): InventoryAdjustmentReason | null {
  if (!reason) return null;
  if (reason.startsWith("RETURN")) return "RETURN";
  if (reason.startsWith("EXPIRED")) return "EXPIRED";
  if (reason.startsWith("DAMAGED")) return "DAMAGED";
  return null;
}

function productNotFoundError() {
  return new Error("This product is no longer available. Remove it from the order and try again.");
}

function insufficientStockError(productName: string, available: number) {
  return new Error(`Insufficient stock for ${productName}. Only ${available} left.`);
}

function normalizeSettingsMerchantId(merchantId: string | null | undefined): string {
  const value = String(merchantId ?? "").trim();
  if (!value) {
    throw new Error("Missing merchant id for settings.");
  }
  return value;
}

async function repairSettingsRows(db: Awaited<ReturnType<typeof getDb>>, merchantId: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM settings WHERE merchant_id = ? ORDER BY updated_at DESC, created_at DESC;",
    [merchantId]
  );

  if (rows.length <= 1) {
    return;
  }

  const staleIds = rows.slice(1).map((row) => row.id);
  if (staleIds.length === 0) {
    return;
  }

  const placeholders = staleIds.map(() => "?").join(",");
  await db.runAsync(`DELETE FROM settings WHERE id IN (${placeholders});`, staleIds as any[]);
}

async function selectSettingsRow(db: Awaited<ReturnType<typeof getDb>>, merchantId: string): Promise<Record<string, unknown> | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM settings WHERE merchant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC LIMIT 1;",
    [merchantId]
  );

  return row ? toCamel(row) : null;
}

async function upsertSettingsRow(input: SettingsRowInput): Promise<void> {
  const db = await getDb();
  const merchantId = normalizeSettingsMerchantId(input.merchantId);
  await repairSettingsRows(db, merchantId);
  await db.runAsync(
    `INSERT INTO settings (
      id, merchant_id, created_by_user_id, updated_by_user_id, business_name, currency_code, currency_symbol, payment_instructions,
      whatsapp_template, support_phone, support_email, created_at, updated_at, deleted_at,
      version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(merchant_id) DO UPDATE SET
      id = excluded.id,
      created_by_user_id = excluded.created_by_user_id,
      updated_by_user_id = excluded.updated_by_user_id,
      business_name = excluded.business_name,
      currency_code = excluded.currency_code,
      currency_symbol = excluded.currency_symbol,
      payment_instructions = excluded.payment_instructions,
      whatsapp_template = excluded.whatsapp_template,
      support_phone = excluded.support_phone,
      support_email = excluded.support_email,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      version = excluded.version,
      last_modified_by_device_id = excluded.last_modified_by_device_id;`,
    [
      input.id,
      merchantId,
      input.createdByUserId ?? null,
      input.updatedByUserId ?? null,
      input.businessName,
      input.currencyCode,
      input.currencySymbol,
      input.paymentInstructions,
      input.whatsappTemplate,
      input.supportPhone ?? null,
      input.supportEmail ?? null,
      input.createdAt,
      input.updatedAt,
      input.deletedAt ?? null,
      input.version,
      input.lastModifiedByDeviceId
    ] as any[]
  );
}

async function ensureSettingsRow(merchantId: string): Promise<Record<string, unknown>> {
  const normalizedMerchantId = normalizeSettingsMerchantId(merchantId);
  const activeLock = settingsInitLocks.get(normalizedMerchantId);
  if (activeLock) {
    return activeLock;
  }

  const pending = (async () => {
    const db = await getDb();
    await repairSettingsRows(db, normalizedMerchantId);

    const existing = await selectSettingsRow(db, normalizedMerchantId);
    if (existing) {
      return existing;
    }

    const now = nowIso();
    const deviceId = await getDeviceId();
    await upsertSettingsRow({
      id: generateId(),
      merchantId: normalizedMerchantId,
      createdByUserId: null,
      updatedByUserId: null,
      businessName: "My Business",
      currencyCode: "USD",
      currencySymbol: "$",
      paymentInstructions: "EcoCash / ZIPIT / Bank transfer / Cash",
      whatsappTemplate:
        "{businessName}\\nOrder #{orderNumber}\\n{items}\\nTotal: {total}\\nBalance: {balance}\\nPayment: {paymentInstructions}\\nThank you.",
      supportPhone: "+263770000000",
      supportEmail: "support@example.com",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      lastModifiedByDeviceId: deviceId
    });

    const created = await selectSettingsRow(db, normalizedMerchantId);
    if (!created) {
      throw new Error("Failed to initialize local settings.");
    }

    return created;
  })().finally(() => {
    settingsInitLocks.delete(normalizedMerchantId);
  });

  settingsInitLocks.set(normalizedMerchantId, pending);
  return pending;
}

async function enqueue(
  context: SessionContext,
  entityType: string,
  entityId: string,
  opType: "UPSERT" | "DELETE",
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO outbox (id, op_id, entity_type, entity_id, op_type, payload, user_id, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);",
    [generateId(), generateId(), entityType, entityId, opType, JSON.stringify(payload), context.userId, context.deviceId, nowIso()]
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
    userId: string | null;
    deviceId: string | null;
  }>
> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT op_id, entity_type, op_type, entity_id, payload, user_id, device_id, created_at FROM outbox ORDER BY created_at ASC LIMIT ?;",
    [limit]
  );

  return rows.map((row) => ({
    opId: row.op_id,
    entityType: row.entity_type,
    opType: row.op_type as "UPSERT" | "DELETE",
    entityId: row.entity_id,
    payload: JSON.parse(row.payload),
    clientUpdatedAt: row.created_at,
    userId: row.user_id,
    deviceId: row.device_id
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

async function getCategoryById(merchantId: string, id: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM categories WHERE merchant_id = ? AND id = ? AND deleted_at IS NULL;",
    [merchantId, id]
  );
  return row ? toCamel(row) : null;
}

export async function listCategories(merchantId: string): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM categories
     WHERE merchant_id = ? AND deleted_at IS NULL
     ORDER BY name COLLATE NOCASE ASC, updated_at DESC;`,
    [merchantId]
  );

  return rows.map((row) => toCamel(row));
}

export async function saveCategory(context: SessionContext, input: SaveCategoryInput): Promise<Record<string, unknown>> {
  const db = await getDb();
  const id = input.id ?? generateId();
  const existing = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM categories WHERE merchant_id = ? AND id = ?;",
    [context.merchantId, id]
  );
  const version = existing ? existing.version + 1 : 1;
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO categories (
      id, merchant_id, created_by_user_id, updated_by_user_id, name, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_by_user_id = excluded.updated_by_user_id,
      name = excluded.name,
      updated_at = excluded.updated_at,
      deleted_at = NULL,
      version = excluded.version,
      last_modified_by_device_id = excluded.last_modified_by_device_id;`,
    [id, context.merchantId, context.userId, context.userId, input.name, now, now, version, context.deviceId]
  );

  const category = (await getCategoryById(context.merchantId, id))!;
  const categoryName = typeof category.name === "string" ? category.name : input.name;

  await db.runAsync(
    `UPDATE products
     SET category = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND category_id = ? AND deleted_at IS NULL;`,
    [categoryName, now, context.userId, context.deviceId, context.merchantId, id]
  );

  const affectedProducts = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM products WHERE merchant_id = ? AND category_id = ? AND deleted_at IS NULL;",
    [context.merchantId, id]
  );
  for (const row of affectedProducts) {
    await enqueue(context, "product", String(row.id), "UPSERT", toCamel(row));
  }

  await enqueue(context, "category", id, "UPSERT", category);
  return category;
}

export async function deleteCategory(context: SessionContext, categoryId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `UPDATE categories
     SET deleted_at = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, now, context.userId, context.deviceId, context.merchantId, categoryId]
  );

  await db.runAsync(
    `UPDATE products
     SET category_id = NULL, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND category_id = ? AND deleted_at IS NULL;`,
    [now, context.userId, context.deviceId, context.merchantId, categoryId]
  );

  const [category, products] = await Promise.all([
    db.getFirstAsync<Record<string, unknown>>("SELECT * FROM categories WHERE merchant_id = ? AND id = ?;", [context.merchantId, categoryId]),
    db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM products WHERE merchant_id = ? AND deleted_at IS NULL AND category_id IS NULL AND updated_at = ?;",
      [context.merchantId, now]
    )
  ]);

  if (category) {
    await enqueue(context, "category", categoryId, "DELETE", toCamel(category));
  }
  for (const row of products) {
    await enqueue(context, "product", String(row.id), "UPSERT", toCamel(row));
  }
}

export async function listProducts(merchantId: string, search = "", lowStockOnly = false, categoryId = ""): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM products
     WHERE merchant_id = ?
       AND deleted_at IS NULL
       AND (? = '' OR category_id = ?)
       AND (? = '' OR LOWER(name) LIKE '%' || LOWER(?) || '%' OR LOWER(COALESCE(sku, '')) LIKE '%' || LOWER(?) || '%')
     ORDER BY updated_at DESC;`,
    [merchantId, categoryId, categoryId, search, search, search]
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
  const current = (await getProductById(context.merchantId, id)) as LocalProductRow | null;
  const nextCategoryId = input.categoryId !== undefined ? input.categoryId ?? null : typeof current?.categoryId === "string" ? current.categoryId : null;
  const category = nextCategoryId ? await getCategoryById(context.merchantId, nextCategoryId) : null;
  const nextCategoryName = category && typeof category.name === "string" ? category.name : null;

  await db.runAsync(
    `INSERT INTO products (
      id, merchant_id, created_by_user_id, updated_by_user_id, name, price, cost, sku, category_id, category, stock_qty, low_stock_threshold,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_by_user_id = excluded.updated_by_user_id,
      name = excluded.name,
      price = excluded.price,
      cost = excluded.cost,
      sku = excluded.sku,
      category_id = excluded.category_id,
      category = excluded.category,
      stock_qty = excluded.stock_qty,
      low_stock_threshold = excluded.low_stock_threshold,
      updated_at = excluded.updated_at,
      deleted_at = NULL,
      version = excluded.version,
      last_modified_by_device_id = excluded.last_modified_by_device_id;`,
    [
      id,
      context.merchantId,
      context.userId,
      context.userId,
      input.name,
      input.price,
      input.cost ?? null,
      input.sku ?? null,
      nextCategoryId,
      nextCategoryName,
      input.stockQty,
      input.lowStockThreshold,
      now,
      now,
      version,
      context.deviceId
    ]
  );

  const product = (await getProductById(context.merchantId, id))!;
  await enqueue(context, "product", id, "UPSERT", product);
  return product;
}

export async function deleteProduct(context: SessionContext, productId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `UPDATE products
     SET deleted_at = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, now, context.userId, context.deviceId, context.merchantId, productId]
  );

  const product = await getProductById(context.merchantId, productId);
  if (product) {
    await enqueue(context, "product", productId, "DELETE", product);
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
    categoryId: product.categoryId ? String(product.categoryId) : null,
    stockQty: nextQty,
    lowStockThreshold: Number(product.lowStockThreshold)
  });

  const db = await getDb();
  const now = nowIso();
  const movementId = generateId();
  const type = "ADJUSTMENT";

  await db.runAsync(
    `INSERT INTO stock_movements (
      id, merchant_id, product_id, created_by_user_id, updated_by_user_id, type, quantity, reason, order_id,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, ?);`,
    [movementId, context.merchantId, productId, context.userId, context.userId, type, quantity, reason ?? "Manual adjustment", now, now, context.deviceId]
  );

  const movement = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM stock_movements WHERE id = ?;",
    [movementId]
  );

  if (movement) {
    await enqueue(context, "stockMovement", movementId, "UPSERT", toCamel(movement));
  }

  await enqueue(context, "product", productId, "UPSERT", updated);
}

export async function recordInventoryAdjustment(
  context: SessionContext,
  input: RecordInventoryAdjustmentInput
): Promise<Record<string, unknown>> {
  const product = await getProductById(context.merchantId, input.productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const absoluteQty = Math.abs(Number(input.quantity));
  const signedQuantity = input.reason === "RETURN" ? absoluteQty : -absoluteQty;
  const nextType = input.reason === "RETURN" ? "IN" : "OUT";

  const updated = await saveProduct(context, {
    id: String(product.id),
    name: String(product.name),
    price: Number(product.price),
    cost: product.cost === null ? null : Number(product.cost),
    sku: product.sku ? String(product.sku) : null,
    categoryId: product.categoryId ? String(product.categoryId) : null,
    stockQty: Number(product.stockQty) + signedQuantity,
    lowStockThreshold: Number(product.lowStockThreshold)
  });

  const db = await getDb();
  const movementId = generateId();
  const createdAt = input.occurredAt ?? nowIso();

  await db.runAsync(
    `INSERT INTO stock_movements (
      id, merchant_id, product_id, created_by_user_id, updated_by_user_id, type, quantity, reason, order_id,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
    [
      movementId,
      context.merchantId,
      input.productId,
      context.userId,
      context.userId,
      nextType,
      signedQuantity,
      formatAdjustmentReason(input.reason, input.notes),
      input.orderId ?? null,
      createdAt,
      createdAt,
      context.deviceId
    ]
  );

  const movement = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM stock_movements WHERE id = ?;",
    [movementId]
  );

  if (!movement) {
    throw new Error("Failed to record inventory adjustment");
  }

  await enqueue(context, "stockMovement", movementId, "UPSERT", toCamel(movement));
  await enqueue(context, "product", input.productId, "UPSERT", updated);
  return toCamel(movement);
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
      id, merchant_id, created_by_user_id, updated_by_user_id, name, phone, notes, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_by_user_id = excluded.updated_by_user_id,
      name = excluded.name,
      phone = excluded.phone,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      deleted_at = NULL,
      version = excluded.version,
      last_modified_by_device_id = excluded.last_modified_by_device_id;`,
    [id, context.merchantId, context.userId, context.userId, input.name, input.phone ?? null, input.notes ?? null, now, now, version, context.deviceId]
  );

  const customer = (await getCustomerById(context.merchantId, id))!;
  await enqueue(context, "customer", id, "UPSERT", customer);
  return customer;
}

export async function deleteCustomer(context: SessionContext, customerId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE customers SET deleted_at = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ? WHERE merchant_id = ? AND id = ?;",
    [now, now, context.userId, context.deviceId, context.merchantId, customerId]
  );

  const customer = await getCustomerById(context.merchantId, customerId);
  if (customer) {
    await enqueue(context, "customer", customerId, "DELETE", customer);
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
  const [rows, paymentRows] = await Promise.all([
    db.getAllAsync<Record<string, unknown>>(
      `SELECT o.*,
              c.name as customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.merchant_id = ?
         AND o.deleted_at IS NULL
         AND (? = '' OR LOWER(o.order_number) LIKE '%' || LOWER(?) || '%' OR LOWER(COALESCE(c.name, '')) LIKE '%' || LOWER(?) || '%')
       ORDER BY o.updated_at DESC;`,
      [merchantId, search, search, search]
    ),
    db.getAllAsync<{ order_id: string; paid_total: number }>(
      `SELECT order_id, COALESCE(SUM(amount), 0) as paid_total
       FROM payments
       WHERE merchant_id = ? AND deleted_at IS NULL AND status = 'CONFIRMED'
       GROUP BY order_id;`,
      [merchantId]
    )
  ]);

  const paidByOrderId = new Map(paymentRows.map((row) => [row.order_id, Number(row.paid_total ?? 0)]));

  return rows.map((row) => {
    const order = toCamel(row);
    const paidTotal = paidByOrderId.get(String(order.id)) ?? 0;
    return {
      ...order,
      customerLabel: String(order.customerName ?? "Walk-in Customer"),
      paidTotal,
      balance: Math.max(Number(order.total ?? 0) - paidTotal, 0)
    };
  });
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
      throw productNotFoundError();
    }

    subtotal += Number(product.price) * item.quantity;
  }

  const discountPercent = input.discountPercent ?? 0;
  const discountAmount = input.discountAmount ?? subtotal * (discountPercent / 100);
  const total = Math.max(subtotal - discountAmount, 0);

  await db.runAsync(
    `INSERT INTO orders (
      id, merchant_id, customer_id, created_by_user_id, updated_by_user_id, order_number, status, subtotal, discount_amount, discount_percent,
      total, notes, confirmed_at, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, ?);`,
    [
      orderId,
      context.merchantId,
      input.customerId ?? null,
      context.userId,
      context.userId,
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
        id, merchant_id, order_id, product_id, created_by_user_id, updated_by_user_id, quantity, unit_price, line_total,
        created_at, updated_at, deleted_at, version, last_modified_by_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
      [generateId(), context.merchantId, orderId, item.productId, context.userId, context.userId, item.quantity, Number(product.price), lineTotal, now, now, context.deviceId]
    );
  }

  const order = (await getOrderById(context.merchantId, orderId))!;
  await enqueue(context, "order", orderId, "UPSERT", order);

  const items = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM order_items WHERE merchant_id = ? AND order_id = ? AND deleted_at IS NULL;",
    [context.merchantId, orderId]
  );

  for (const item of items) {
    await enqueue(context, "orderItem", String(item.id), "UPSERT", toCamel(item));
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
     LEFT JOIN products p ON p.id = oi.product_id AND p.deleted_at IS NULL
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
    await enqueue(context, "order", orderId, "UPSERT", order);
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
      id, merchant_id, product_id, created_by_user_id, updated_by_user_id, type, quantity, reason, order_id,
      created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
    [
      movementId,
      context.merchantId,
      productId,
      context.userId,
      context.userId,
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
    await enqueue(context, "stockMovement", movementId, "UPSERT", toCamel(movement));
  }
}

export async function updateOrderStatus(context: SessionContext, orderId: string, status: string): Promise<void> {
  const db = await getDb();
  const order = await getOrderById(context.merchantId, orderId);
  if (!order) return;
  const now = nowIso();
  const nextStatus = normalizeOrderStatus(status);
  await db.runAsync(
    `UPDATE orders
     SET status = ?, confirmed_at = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [
      nextStatus,
      confirmedAtForStatus(nextStatus, order.confirmedAt as string | null | undefined, now),
      now,
      context.userId,
      context.deviceId,
      context.merchantId,
      orderId
    ]
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
     SET status = 'CONFIRMED', confirmed_at = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, now, context.userId, context.deviceId, context.merchantId, orderId]
  );

  const items = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM order_items WHERE merchant_id = ? AND order_id = ? AND deleted_at IS NULL;",
    [context.merchantId, orderId]
  );

  for (const row of items) {
    const item = toCamel(row);
    const product = await getProductById(context.merchantId, String(item.productId));
    if (!product) {
      throw productNotFoundError();
    }

    const available = Number(product.stockQty);
    const required = Number(item.quantity);
    if (available < required) {
      throw insufficientStockError(String(product.name), available);
    }
  }

  for (const row of items) {
    const item = toCamel(row);
    const product = await getProductById(context.merchantId, String(item.productId));
    if (!product) {
      throw productNotFoundError();
    }

    await saveProduct(context, {
      id: String(product.id),
      name: String(product.name),
      price: Number(product.price),
      cost: product.cost === null ? null : Number(product.cost),
      sku: product.sku ? String(product.sku) : null,
      categoryId: product.categoryId ? String(product.categoryId) : null,
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
     SET status = 'CANCELLED', updated_at = ?, updated_by_user_id = ?, version = version + 1, last_modified_by_device_id = ?
     WHERE merchant_id = ? AND id = ?;`,
    [now, context.userId, context.deviceId, context.merchantId, orderId]
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
        categoryId: product.categoryId ? String(product.categoryId) : null,
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
  } else if (["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(nextStatus)) {
    if (details.paid >= Number(order.total)) {
      nextStatus = "PAID";
    } else {
      nextStatus = "PARTIALLY_PAID";
    }
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
      id, merchant_id, order_id, created_by_user_id, updated_by_user_id, amount, method, reference, paid_at,
      status, paynow_transaction_id, created_at, updated_at, deleted_at, version, last_modified_by_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?);`,
    [
      id,
      context.merchantId,
      input.orderId,
      context.userId,
      context.userId,
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
  await enqueue(context, "payment", id, "UPSERT", payment);

  await updateOrderPaymentStatus(context, input.orderId);

  return payment;
}

export async function listPayments(merchantId: string): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM payments
     WHERE merchant_id = ? AND deleted_at IS NULL
     ORDER BY paid_at DESC;`,
    [merchantId]
  );

  return rows.map((row) => toCamel(row));
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
  salesBasis: "PAYMENTS_RECEIVED";
  ordersCountBasis: "ORDERS_CREATED";
  generatedAt: string;
  today: { salesTotal: number; ordersCount: number; outstandingTotal: number };
  last7Days: {
    salesTotal: number;
    ordersCount: number;
    outstandingTotal: number;
    topProducts: Array<{ productId: string; name: string; categoryName: string | null; qty: number; revenue: number }>;
    topCategories: Array<{ categoryId: string | null; name: string; qty: number; revenue: number }>;
  };
  last30Days: {
    salesTotal: number;
    ordersCount: number;
    outstandingTotal: number;
    topProducts: Array<{ productId: string; name: string; categoryName: string | null; qty: number; revenue: number }>;
    topCategories: Array<{ categoryId: string | null; name: string; qty: number; revenue: number }>;
  };
  daily: Array<{
    date: string;
    paymentsTotal: number;
    ordersCount: number;
    outstandingTotal: number;
    returnsQty: number;
    expiredQty: number;
    damagedQty: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    categoryId: string | null;
    categoryName: string | null;
    qtySold: number;
    revenue: number;
    profit: number | null;
  }>;
  topCategories: Array<{
    categoryId: string | null;
    name: string;
    qtySold: number;
    revenue: number;
    profit: number | null;
  }>;
  lowStock: Array<{
    productId: string;
    name: string;
    categoryId: string | null;
    categoryName: string | null;
    stockQty: number;
    lowStockThreshold: number;
  }>;
  returnsExpired: {
    returnsCount: number;
    returnsValue: number;
    expiredCount: number;
    expiredValue: number;
    damagedCount: number;
    damagedValue: number;
  };
}> {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29);

  const [categories, products, orders, orderItems, payments, movements] = await Promise.all([
    listCategories(merchantId),
    listProducts(merchantId),
    listOrders(merchantId),
    db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM order_items WHERE merchant_id = ? AND deleted_at IS NULL ORDER BY created_at ASC;",
      [merchantId]
    ).then((rows) => rows.map((row) => toCamel(row))),
    listPayments(merchantId),
    listStockMovements(merchantId)
  ]);

  const categoryById = new Map<string, LocalCategoryRow>(categories.map((category) => [String(category.id), category as LocalCategoryRow]));
  const productById = new Map<string, LocalProductRow>(
    products.map((product) => [
      String(product.id),
      {
        ...(product as LocalProductRow),
        categoryName:
          product.categoryId && typeof product.categoryId === "string"
            ? String(categoryById.get(product.categoryId)?.name ?? product.category ?? "Uncategorized")
            : String(product.category ?? "Uncategorized")
      }
    ])
  );
  const paymentsByOrderId = new Map<string, number>();
  for (const payment of payments) {
    if (String(payment.status) !== "CONFIRMED") continue;
    const key = String(payment.orderId);
    paymentsByOrderId.set(key, (paymentsByOrderId.get(key) ?? 0) + Number(payment.amount));
  }

  const buildWindowSummary = (since: Date) => {
    const windowOrders = orders.filter((order) => new Date(String(order.createdAt)) >= since);
    const salesTotal = payments
      .filter((payment) => String(payment.status) === "CONFIRMED" && new Date(String(payment.paidAt)) >= since)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const outstandingTotal = windowOrders.reduce((sum, order) => {
      if (String(order.status) === "CANCELLED") return sum;
      return sum + Math.max(Number(order.total) - (paymentsByOrderId.get(String(order.id)) ?? 0), 0);
    }, 0);

    const confirmedOrderIds = new Set(
      windowOrders.filter((order) => ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(String(order.status))).map((order) => String(order.id))
    );
    const topProductsMap = new Map<string, { productId: string; name: string; categoryName: string | null; qty: number; revenue: number }>();
    const topCategoriesMap = new Map<string, { categoryId: string | null; name: string; qty: number; revenue: number }>();

    for (const item of orderItems) {
      if (!confirmedOrderIds.has(String(item.orderId))) continue;
      const product = productById.get(String(item.productId));
      const qty = Number(item.quantity);
      const revenue = Number(item.lineTotal);
      const productEntry = topProductsMap.get(String(item.productId)) ?? {
        productId: String(item.productId),
        name: String(product?.name ?? "Unavailable product"),
        categoryName: typeof product?.categoryName === "string" ? product.categoryName : null,
        qty: 0,
        revenue: 0
      };
      productEntry.qty += qty;
      productEntry.revenue += revenue;
      topProductsMap.set(String(item.productId), productEntry);

      const categoryKey = typeof product?.categoryId === "string" ? product.categoryId : `name:${String(product?.categoryName ?? "Uncategorized")}`;
      const categoryEntry = topCategoriesMap.get(categoryKey) ?? {
        categoryId: typeof product?.categoryId === "string" ? product.categoryId : null,
        name: String(product?.categoryName ?? "Uncategorized"),
        qty: 0,
        revenue: 0
      };
      categoryEntry.qty += qty;
      categoryEntry.revenue += revenue;
      topCategoriesMap.set(categoryKey, categoryEntry);
    }

    return {
      salesTotal,
      ordersCount: windowOrders.length,
      outstandingTotal,
      topProducts: [...topProductsMap.values()].sort((left, right) => right.revenue - left.revenue || right.qty - left.qty).slice(0, 10),
      topCategories: [...topCategoriesMap.values()].sort((left, right) => right.revenue - left.revenue || right.qty - left.qty).slice(0, 10)
    };
  };

  const daily = Array.from({ length: 30 }, (_, index) => {
    const dayStart = new Date(thirtyDaysAgo);
    dayStart.setDate(thirtyDaysAgo.getDate() + index);
    const nextDay = new Date(dayStart);
    nextDay.setDate(dayStart.getDate() + 1);
    const date = dayStart.toISOString().slice(0, 10);

    const paymentsTotal = payments
      .filter((payment) => String(payment.status) === "CONFIRMED" && new Date(String(payment.paidAt)) >= dayStart && new Date(String(payment.paidAt)) < nextDay)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const ordersCount = orders.filter((order) => new Date(String(order.createdAt)) >= dayStart && new Date(String(order.createdAt)) < nextDay).length;
    const outstandingTotal = orders.reduce((sum, order) => {
      if (new Date(String(order.createdAt)) >= nextDay || String(order.status) === "CANCELLED") {
        return sum;
      }
      const paid = payments
        .filter((payment) => String(payment.orderId) === String(order.id) && String(payment.status) === "CONFIRMED" && new Date(String(payment.paidAt)) < nextDay)
        .reduce((running, payment) => running + Number(payment.amount), 0);
      const balance = Math.max(Number(order.total) - paid, 0);
      if (!["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID"].includes(String(order.status)) && balance <= 0) {
        return sum;
      }
      return sum + balance;
    }, 0);

    const movementTotals = movements.reduce<{ returnsQty: number; expiredQty: number; damagedQty: number }>(
      (summary, movement) => {
        if (String(movement.createdAt).slice(0, 10) !== date) return summary;
        const reason = parseAdjustmentReason(String(movement.reason ?? ""));
        if (!reason) return summary;
        const qty = Math.abs(Number(movement.quantity));
        if (reason === "RETURN") summary.returnsQty += qty;
        if (reason === "EXPIRED") summary.expiredQty += qty;
        if (reason === "DAMAGED") summary.damagedQty += qty;
        return summary;
      },
      { returnsQty: 0, expiredQty: 0, damagedQty: 0 }
    );

    return {
      date,
      paymentsTotal,
      ordersCount,
      outstandingTotal,
      returnsQty: movementTotals.returnsQty,
      expiredQty: movementTotals.expiredQty,
      damagedQty: movementTotals.damagedQty
    };
  });

  const topProductsMap = new Map<string, { productId: string; name: string; categoryId: string | null; categoryName: string | null; qtySold: number; revenue: number; profit: number | null }>();
  for (const item of orderItems) {
    const order = orders.find((candidate) => String(candidate.id) === String(item.orderId));
    if (!order || new Date(String(order.createdAt)) < thirtyDaysAgo || !["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(String(order.status))) {
      continue;
    }
    const product = productById.get(String(item.productId));
    const current = topProductsMap.get(String(item.productId)) ?? {
      productId: String(item.productId),
      name: String(product?.name ?? "Unavailable product"),
      categoryId: typeof product?.categoryId === "string" ? product.categoryId : null,
      categoryName: typeof product?.categoryName === "string" ? product.categoryName : null,
      qtySold: 0,
      revenue: 0,
      profit: product?.cost == null ? null : 0
    };
    const qty = Number(item.quantity);
    const revenue = Number(item.lineTotal);
    current.qtySold += qty;
    current.revenue += revenue;
    if (current.profit != null && product?.cost != null) {
      current.profit += revenue - Number(product.cost) * qty;
    }
    topProductsMap.set(String(item.productId), current);
  }

  const topCategoriesMap = new Map<string, { categoryId: string | null; name: string; qtySold: number; revenue: number; profit: number | null }>();
  for (const item of topProductsMap.values()) {
    const key = item.categoryId ?? `name:${item.categoryName ?? "Uncategorized"}`;
    const current = topCategoriesMap.get(key) ?? {
      categoryId: item.categoryId,
      name: item.categoryName ?? "Uncategorized",
      qtySold: 0,
      revenue: 0,
      profit: item.profit == null ? null : 0
    };
    current.qtySold += item.qtySold;
    current.revenue += item.revenue;
    if (current.profit != null && item.profit != null) {
      current.profit += item.profit;
    }
    topCategoriesMap.set(key, current);
  }

  const returnsExpired = movements.reduce<{
    returnsCount: number;
    returnsValue: number;
    expiredCount: number;
    expiredValue: number;
    damagedCount: number;
    damagedValue: number;
  }>(
    (summary, movement) => {
      if (new Date(String(movement.createdAt)) < thirtyDaysAgo) return summary;
      const reason = parseAdjustmentReason(String(movement.reason ?? ""));
      if (!reason) return summary;
      const product = productById.get(String(movement.productId));
      const quantity = Math.abs(Number(movement.quantity));
      const value = quantity * Number(product?.price ?? 0);
      if (reason === "RETURN") {
        summary.returnsCount += quantity;
        summary.returnsValue += value;
      }
      if (reason === "EXPIRED") {
        summary.expiredCount += quantity;
        summary.expiredValue += value;
      }
      if (reason === "DAMAGED") {
        summary.damagedCount += quantity;
        summary.damagedValue += value;
      }
      return summary;
    },
    {
      returnsCount: 0,
      returnsValue: 0,
      expiredCount: 0,
      expiredValue: 0,
      damagedCount: 0,
      damagedValue: 0
    }
  );

  const lowStock = products
    .filter((product) => Number(product.stockQty) <= Number(product.lowStockThreshold))
    .map((product) => ({
      productId: String(product.id),
      name: String(product.name),
      categoryId: typeof product.categoryId === "string" ? product.categoryId : null,
      categoryName:
        typeof product.categoryId === "string"
          ? String(categoryById.get(product.categoryId)?.name ?? product.category ?? "Uncategorized")
          : String(product.category ?? "Uncategorized"),
      stockQty: Number(product.stockQty),
      lowStockThreshold: Number(product.lowStockThreshold)
    }))
    .sort((left, right) => left.stockQty - right.stockQty || left.name.localeCompare(right.name));

  return {
    salesBasis: "PAYMENTS_RECEIVED",
    ordersCountBasis: "ORDERS_CREATED",
    generatedAt: nowIso(),
    today: buildWindowSummary(today),
    last7Days: buildWindowSummary(sevenDaysAgo),
    last30Days: buildWindowSummary(thirtyDaysAgo),
    daily,
    topProducts: [...topProductsMap.values()].sort((left, right) => right.revenue - left.revenue || right.qtySold - left.qtySold).slice(0, 10),
    topCategories: [...topCategoriesMap.values()].sort((left, right) => right.revenue - left.revenue || right.qtySold - left.qtySold).slice(0, 10),
    lowStock,
    returnsExpired
  };
}

export async function getSettings(merchantId: string): Promise<Record<string, unknown>> {
  return ensureSettingsRow(merchantId);
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
  const current = await getSettings(context.merchantId);
  const createdAt = typeof current.createdAt === "string" ? current.createdAt : nowIso();
  const deletedAt = typeof current.deletedAt === "string" ? current.deletedAt : null;
  const createdByUserId = typeof current.createdByUserId === "string" ? current.createdByUserId : context.userId;
  const next = {
    ...current,
    ...input,
    id: String(current.id),
    merchantId: context.merchantId,
    createdAt,
    deletedAt,
    createdByUserId,
    updatedByUserId: context.userId,
    updatedAt: nowIso(),
    version: Number(current.version) + 1,
    lastModifiedByDeviceId: context.deviceId
  };

  await upsertSettingsRow({
    id: String(next.id),
    merchantId: context.merchantId,
    createdByUserId: typeof next.createdByUserId === "string" ? next.createdByUserId : context.userId,
    updatedByUserId: typeof next.updatedByUserId === "string" ? next.updatedByUserId : context.userId,
    businessName: String(next.businessName ?? ""),
    currencyCode: next.currencyCode === "ZWL" ? "ZWL" : "USD",
    currencySymbol: String(next.currencySymbol ?? "$"),
    paymentInstructions: String(next.paymentInstructions ?? ""),
    whatsappTemplate: String(next.whatsappTemplate ?? ""),
    supportPhone: typeof next.supportPhone === "string" ? next.supportPhone : next.supportPhone ?? null,
    supportEmail: typeof next.supportEmail === "string" ? next.supportEmail : next.supportEmail ?? null,
    createdAt: String(next.createdAt ?? nowIso()),
    updatedAt: String(next.updatedAt),
    deletedAt: next.deletedAt == null ? null : String(next.deletedAt),
    version: Number(next.version),
    lastModifiedByDeviceId: String(next.lastModifiedByDeviceId)
  });

  const updated = await getSettings(context.merchantId);
  await enqueue(context, "settings", String(updated.id), "UPSERT", updated);
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

  await enqueue(context, "featureFlag", id, "UPSERT", {
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

async function mergeSettingsRow(merchantId: string, row: SyncPullResponse["changes"]["settings"][number]): Promise<void> {
  const normalizedMerchantId = normalizeSettingsMerchantId(row.merchantId ?? merchantId);
  const db = await getDb();
  const existing = await db.getFirstAsync<{ updated_at: string }>(
    "SELECT updated_at FROM settings WHERE merchant_id = ?;",
    [normalizedMerchantId]
  );

  if (existing && new Date(existing.updated_at).getTime() > new Date(String(row.updatedAt)).getTime()) {
    return;
  }

  await upsertSettingsRow({
    id: String(row.id),
    merchantId: normalizedMerchantId,
    createdByUserId: row.createdByUserId ?? null,
    updatedByUserId: row.updatedByUserId ?? null,
    businessName: String(row.businessName ?? "My Business"),
    currencyCode: row.currencyCode === "ZWL" ? "ZWL" : "USD",
    currencySymbol: String(row.currencySymbol ?? "$"),
    paymentInstructions: String(row.paymentInstructions ?? "EcoCash / ZIPIT / Bank transfer / Cash"),
    whatsappTemplate:
      typeof row.whatsappTemplate === "string" && row.whatsappTemplate.trim()
        ? row.whatsappTemplate
        : "{businessName}\\nOrder #{orderNumber}\\n{items}\\nTotal: {total}\\nBalance: {balance}\\nPayment: {paymentInstructions}\\nThank you.",
    supportPhone: row.supportPhone ?? null,
    supportEmail: row.supportEmail ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    deletedAt: row.deletedAt ?? null,
    version: Number(row.version ?? 1),
    lastModifiedByDeviceId: String(row.lastModifiedByDeviceId ?? "sync")
  });
}

export async function applySyncChanges(
  merchantId: string,
  changes: SyncPullResponse["changes"]
): Promise<void> {
  for (const row of changes.categories) {
    await mergeRow(
      "categories",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "created_by_user_id",
        "updated_by_user_id",
        "name",
        "created_at",
        "updated_at",
        "deleted_at",
        "version",
        "last_modified_by_device_id"
      ],
      [
        row.id,
        row.merchantId,
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
        row.name,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
        row.version,
        row.lastModifiedByDeviceId
      ]
    );
  }

  for (const row of changes.products) {
    await mergeRow(
      "products",
      merchantId,
      row,
      [
        "id",
        "merchant_id",
        "created_by_user_id",
        "updated_by_user_id",
        "name",
        "price",
        "cost",
        "sku",
        "category_id",
        "category",
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
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
        row.name,
        row.price,
        row.cost,
        row.sku,
        row.categoryId ?? null,
        row.category ?? null,
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
        "created_by_user_id",
        "updated_by_user_id",
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
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
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
        "created_by_user_id",
        "updated_by_user_id",
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
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
        row.orderNumber,
        row.status,
        row.subtotal,
        row.discountAmount,
        row.discountPercent,
        row.total,
        row.notes,
        row.confirmedAt ?? null,
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
        "created_by_user_id",
        "updated_by_user_id",
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
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
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
        "created_by_user_id",
        "updated_by_user_id",
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
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
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
        "created_by_user_id",
        "updated_by_user_id",
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
        row.createdByUserId ?? null,
        row.updatedByUserId ?? null,
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
    await mergeSettingsRow(merchantId, row);
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
    categories: Record<string, unknown>[];
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
  const [settings, categories, products, customers, orders, orderItems, payments, stockMovements, featureFlags] = await Promise.all([
    selectAsCamel("SELECT * FROM settings WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
    selectAsCamel("SELECT * FROM categories WHERE merchant_id = ? AND deleted_at IS NULL;", [merchantId]),
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
      categories,
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
    branches: [],
    categories: forceMerchant(Array.isArray(data.categories) ? (data.categories as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["categories"],
    products: forceMerchant(Array.isArray(data.products) ? (data.products as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["products"],
    productStocks: [],
    customers: forceMerchant(Array.isArray(data.customers) ? (data.customers as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["customers"],
    orders: forceMerchant(Array.isArray(data.orders) ? (data.orders as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["orders"],
    orderItems: forceMerchant(Array.isArray(data.orderItems) ? (data.orderItems as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["orderItems"],
    payments: forceMerchant(Array.isArray(data.payments) ? (data.payments as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["payments"],
    paynowTransactions: [],
    stockMovements: forceMerchant(
      Array.isArray(data.stockMovements) ? (data.stockMovements as Record<string, unknown>[]) : [],
      context.merchantId
    ) as SyncPullResponse["changes"]["stockMovements"],
    transfers: [],
    transferItems: [],
    deliveries: [],
    settings: forceMerchant(Array.isArray(data.settings) ? (data.settings as Record<string, unknown>[]) : [], context.merchantId) as SyncPullResponse["changes"]["settings"],
    catalogSettings: [],
    featureFlags: Array.isArray(data.featureFlags) ? (data.featureFlags as SyncPullResponse["changes"]["featureFlags"]) : []
  };

  await applySyncChanges(context.merchantId, changes);
  await setSyncState({ lastError: null });
}
