import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let migrated = false;

const migrationStatements = [
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    cost REAL,
    sku TEXT,
    category_id TEXT,
    category TEXT,
    stock_qty REAL NOT NULL,
    low_stock_threshold REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    customer_id TEXT,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    order_number TEXT NOT NULL,
    status TEXT NOT NULL,
    subtotal REAL NOT NULL,
    discount_amount REAL NOT NULL,
    discount_percent REAL NOT NULL,
    total REAL NOT NULL,
    notes TEXT,
    confirmed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    reference TEXT,
    paid_at TEXT NOT NULL,
    status TEXT NOT NULL,
    paynow_transaction_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    reason TEXT,
    order_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_id TEXT NOT NULL UNIQUE,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    business_name TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    currency_symbol TEXT NOT NULL,
    payment_instructions TEXT NOT NULL,
    whatsapp_template TEXT NOT NULL,
    support_phone TEXT,
    support_email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    last_modified_by_device_id TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS feature_flags (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    merchant_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    op_id TEXT NOT NULL UNIQUE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    user_id TEXT,
    device_id TEXT,
    created_at TEXT NOT NULL
  );`,
  `ALTER TABLE products ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE products ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE products ADD COLUMN category_id TEXT;`,
  `ALTER TABLE products ADD COLUMN category TEXT;`,
  `ALTER TABLE customers ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE customers ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE orders ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE orders ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE order_items ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE order_items ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE payments ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE payments ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE stock_movements ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE stock_movements ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE settings ADD COLUMN created_by_user_id TEXT;`,
  `ALTER TABLE settings ADD COLUMN updated_by_user_id TEXT;`,
  `ALTER TABLE outbox ADD COLUMN user_id TEXT;`,
  `ALTER TABLE outbox ADD COLUMN device_id TEXT;`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_pull_at TEXT,
    last_push_at TEXT,
    last_error TEXT,
    device_id TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_products_merchant_updated ON products(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_categories_merchant_updated ON categories(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_merchant_updated ON customers(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_merchant_updated ON orders(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_merchant_updated ON order_items(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_merchant_updated ON payments(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_merchant_updated ON stock_movements(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_settings_merchant_updated ON settings(merchant_id, updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(created_at);`
];

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const statement of migrationStatements) {
    try {
      await db.execAsync(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("duplicate column")) {
        throw error;
      }
    }
  }

  const existing = await db.getFirstAsync<{ id: number }>("SELECT id FROM sync_state WHERE id = 1;");
  if (!existing) {
    await db.runAsync(
      "INSERT INTO sync_state (id, last_pull_at, last_push_at, last_error, device_id) VALUES (1, NULL, NULL, NULL, ?);",
      ["device-unset"]
    );
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("novoriq_orders.db");
  }

  const db = await dbPromise;

  if (!migrated) {
    await runMigrations(db);
    migrated = true;
  }

  return db;
}
