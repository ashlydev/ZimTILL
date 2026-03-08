-- V3 platform expansion

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ordersource') THEN
    CREATE TYPE "OrderSource" AS ENUM ('IN_STORE', 'ONLINE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orderdocumenttype') THEN
    CREATE TYPE "OrderDocumentType" AS ENUM ('ORDER', 'QUOTE', 'INVOICE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscriptionstatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transferstatus') THEN
    CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deliverystatus') THEN
    CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RoleType' AND e.enumlabel = 'ADMIN'
  ) THEN
    ALTER TYPE "RoleType" ADD VALUE 'ADMIN';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RoleType' AND e.enumlabel = 'STOCK_CONTROLLER'
  ) THEN
    ALTER TYPE "RoleType" ADD VALUE 'STOCK_CONTROLLER';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RoleType' AND e.enumlabel = 'DELIVERY_RIDER'
  ) THEN
    ALTER TYPE "RoleType" ADD VALUE 'DELIVERY_RIDER';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentRecordStatus' AND e.enumlabel = 'FAILED'
  ) THEN
    ALTER TYPE "PaymentRecordStatus" ADD VALUE 'FAILED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentRecordStatus' AND e.enumlabel = 'CANCELLED'
  ) THEN
    ALTER TYPE "PaymentRecordStatus" ADD VALUE 'CANCELLED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'StockMovementType' AND e.enumlabel = 'TRANSFER_OUT'
  ) THEN
    ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_OUT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'StockMovementType' AND e.enumlabel = 'TRANSFER_IN'
  ) THEN
    ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_IN';
  END IF;
END $$;

ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultBranchId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "activeBranchId" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "documentType" "OrderDocumentType" NOT NULL DEFAULT 'ORDER';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "source" "OrderSource" NOT NULL DEFAULT 'IN_STORE';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "PaynowTransaction" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

UPDATE "Merchant"
SET "slug" = CONCAT(
  COALESCE(NULLIF(TRIM(BOTH '-' FROM regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''), 'merchant'),
  '-',
  substring("id" from 1 for 6)
)
WHERE "slug" IS NULL OR trim("slug") = '';

ALTER TABLE "Merchant" ALTER COLUMN "slug" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "Plan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceMonthly" DECIMAL(12,2) NOT NULL,
  "features" JSONB NOT NULL,
  "limits" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "billingPeriodStart" TIMESTAMP(3) NOT NULL,
  "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UsageCounter" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Branch" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductStock" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" DECIMAL(12,3) NOT NULL,
  "lowStockThreshold" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastModifiedByDeviceId" TEXT NOT NULL,
  CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTransfer" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "fromBranchId" TEXT NOT NULL,
  "toBranchId" TEXT NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "receivedByUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastModifiedByDeviceId" TEXT NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTransferItem" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastModifiedByDeviceId" TEXT NOT NULL,
  CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Delivery" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "orderId" TEXT NOT NULL,
  "assignedToUserId" TEXT,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "proofPhotoUrl" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastModifiedByDeviceId" TEXT NOT NULL,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CatalogSettings" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "merchantSlug" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "headline" TEXT,
  "description" TEXT,
  "checkoutPolicy" TEXT NOT NULL DEFAULT 'CONFIRM_ON_PAID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastModifiedByDeviceId" TEXT NOT NULL,
  CONSTRAINT "CatalogSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PublicCatalogOrder" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "orderId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicCatalogOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UpgradeRequest" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "currentPlanId" TEXT,
  "requestedPlanId" TEXT,
  "createdByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UpgradeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RestaurantTable" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KitchenTicket" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "orderId" TEXT,
  "restaurantTableId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KitchenTicketItem" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "productId" TEXT,
  "name" TEXT NOT NULL,
  "qty" DECIMAL(12,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KitchenTicketItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Modifier" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Modifier_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Branch" ("id", "merchantId", "name", "address", "phone", "isDefault", "createdAt", "updatedAt", "deletedAt")
SELECT
  md5(m."id" || '-main-branch'),
  m."id",
  'Main Branch',
  NULL,
  m."phone",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM "Merchant" m
WHERE NOT EXISTS (
  SELECT 1 FROM "Branch" b WHERE b."merchantId" = m."id"
);

UPDATE "User" u
SET "defaultBranchId" = b."id"
FROM "Branch" b
WHERE b."merchantId" = u."merchantId"
  AND b."isDefault" = true
  AND u."defaultBranchId" IS NULL;

UPDATE "Device" d
SET "activeBranchId" = COALESCE(d."activeBranchId", u."defaultBranchId")
FROM "User" u
WHERE u."id" = d."userId";

UPDATE "Order" o
SET "branchId" = b."id"
FROM "Branch" b
WHERE b."merchantId" = o."merchantId"
  AND b."isDefault" = true
  AND o."branchId" IS NULL;

UPDATE "Payment" p
SET "branchId" = o."branchId"
FROM "Order" o
WHERE o."id" = p."orderId"
  AND p."branchId" IS NULL;

UPDATE "StockMovement" sm
SET "branchId" = b."id"
FROM "Branch" b
WHERE b."merchantId" = sm."merchantId"
  AND b."isDefault" = true
  AND sm."branchId" IS NULL;

UPDATE "PaynowTransaction" pt
SET "branchId" = o."branchId"
FROM "Order" o
WHERE o."id" = pt."orderId"
  AND pt."branchId" IS NULL;

INSERT INTO "ProductStock" (
  "id",
  "merchantId",
  "branchId",
  "productId",
  "qty",
  "lowStockThreshold",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "version",
  "lastModifiedByDeviceId"
)
SELECT
  md5(p."id" || '-' || b."id"),
  p."merchantId",
  b."id",
  p."id",
  p."stockQty",
  p."lowStockThreshold",
  p."createdAt",
  p."updatedAt",
  p."deletedAt",
  p."version",
  p."lastModifiedByDeviceId"
FROM "Product" p
JOIN "Branch" b
  ON b."merchantId" = p."merchantId"
 AND b."isDefault" = true
WHERE NOT EXISTS (
  SELECT 1
  FROM "ProductStock" ps
  WHERE ps."branchId" = b."id"
    AND ps."productId" = p."id"
);

INSERT INTO "Plan" ("id", "code", "name", "priceMonthly", "features", "limits", "createdAt", "updatedAt")
SELECT '11111111-1111-1111-1111-111111111111', 'STARTER', 'Starter', 5.00,
  '{"catalog":true,"deliveries":false,"restaurant":false,"reports":"basic"}'::jsonb,
  '{"ordersPerMonth":300,"products":200,"users":3,"branches":1,"devices":3,"catalogViews":5000,"checkouts":300}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Plan" WHERE "code" = 'STARTER');

INSERT INTO "Plan" ("id", "code", "name", "priceMonthly", "features", "limits", "createdAt", "updatedAt")
SELECT '22222222-2222-2222-2222-222222222222', 'PRO', 'Pro', 10.00,
  '{"catalog":true,"deliveries":true,"restaurant":false,"reports":"advanced"}'::jsonb,
  '{"ordersPerMonth":1500,"products":1500,"users":10,"branches":3,"devices":10,"catalogViews":25000,"checkouts":1500}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Plan" WHERE "code" = 'PRO');

INSERT INTO "Plan" ("id", "code", "name", "priceMonthly", "features", "limits", "createdAt", "updatedAt")
SELECT '33333333-3333-3333-3333-333333333333', 'BUSINESS', 'Business', 20.00,
  '{"catalog":true,"deliveries":true,"restaurant":true,"reports":"advanced"}'::jsonb,
  '{"ordersPerMonth":5000,"products":5000,"users":30,"branches":10,"devices":30,"catalogViews":100000,"checkouts":5000}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Plan" WHERE "code" = 'BUSINESS');

INSERT INTO "Plan" ("id", "code", "name", "priceMonthly", "features", "limits", "createdAt", "updatedAt")
SELECT '44444444-4444-4444-4444-444444444444', 'ENTERPRISE', 'Enterprise', 0.00,
  '{"catalog":true,"deliveries":true,"restaurant":true,"reports":"enterprise"}'::jsonb,
  '{"ordersPerMonth":999999,"products":999999,"users":999,"branches":999,"devices":999,"catalogViews":999999,"checkouts":999999}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Plan" WHERE "code" = 'ENTERPRISE');

INSERT INTO "Subscription" (
  "id",
  "merchantId",
  "planId",
  "status",
  "billingPeriodStart",
  "billingPeriodEnd",
  "createdAt",
  "updatedAt",
  "cancelledAt"
)
SELECT
  md5(m."id" || '-starter-sub'),
  m."id",
  p."id",
  'TRIALING',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + interval '30 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM "Merchant" m
JOIN "Plan" p ON p."code" = 'STARTER'
WHERE NOT EXISTS (
  SELECT 1 FROM "Subscription" s WHERE s."merchantId" = m."id"
);

INSERT INTO "CatalogSettings" (
  "id",
  "merchantId",
  "merchantSlug",
  "isEnabled",
  "headline",
  "description",
  "checkoutPolicy",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "version",
  "lastModifiedByDeviceId"
)
SELECT
  md5(m."id" || '-catalog-settings'),
  m."id",
  m."slug",
  false,
  m."name",
  'Shop online and pay via EcoCash or Paynow.',
  'CONFIRM_ON_PAID',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL,
  1,
  'server-migration'
FROM "Merchant" m
WHERE NOT EXISTS (
  SELECT 1 FROM "CatalogSettings" cs WHERE cs."merchantId" = m."id"
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_code_key" ON "Plan"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Merchant_slug_key" ON "Merchant"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "UsageCounter_merchantId_key_periodStart_periodEnd_key" ON "UsageCounter"("merchantId", "key", "periodStart", "periodEnd");
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_merchantId_name_key" ON "Branch"("merchantId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductStock_branchId_productId_key" ON "ProductStock"("branchId", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "Delivery_orderId_key" ON "Delivery"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogSettings_merchantId_key" ON "CatalogSettings"("merchantId");
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogSettings_merchantSlug_key" ON "CatalogSettings"("merchantSlug");
CREATE UNIQUE INDEX IF NOT EXISTS "PublicCatalogOrder_orderId_key" ON "PublicCatalogOrder"("orderId");

CREATE INDEX IF NOT EXISTS "Subscription_merchantId_idx" ON "Subscription"("merchantId");
CREATE INDEX IF NOT EXISTS "Subscription_updatedAt_idx" ON "Subscription"("updatedAt");
CREATE INDEX IF NOT EXISTS "UsageCounter_merchantId_idx" ON "UsageCounter"("merchantId");
CREATE INDEX IF NOT EXISTS "UsageCounter_updatedAt_idx" ON "UsageCounter"("updatedAt");
CREATE INDEX IF NOT EXISTS "Branch_merchantId_idx" ON "Branch"("merchantId");
CREATE INDEX IF NOT EXISTS "Branch_updatedAt_idx" ON "Branch"("updatedAt");
CREATE INDEX IF NOT EXISTS "ProductStock_merchantId_idx" ON "ProductStock"("merchantId");
CREATE INDEX IF NOT EXISTS "ProductStock_branchId_idx" ON "ProductStock"("branchId");
CREATE INDEX IF NOT EXISTS "ProductStock_updatedAt_idx" ON "ProductStock"("updatedAt");
CREATE INDEX IF NOT EXISTS "StockTransfer_merchantId_idx" ON "StockTransfer"("merchantId");
CREATE INDEX IF NOT EXISTS "StockTransfer_updatedAt_idx" ON "StockTransfer"("updatedAt");
CREATE INDEX IF NOT EXISTS "StockTransferItem_merchantId_idx" ON "StockTransferItem"("merchantId");
CREATE INDEX IF NOT EXISTS "StockTransferItem_updatedAt_idx" ON "StockTransferItem"("updatedAt");
CREATE INDEX IF NOT EXISTS "Delivery_merchantId_idx" ON "Delivery"("merchantId");
CREATE INDEX IF NOT EXISTS "Delivery_branchId_idx" ON "Delivery"("branchId");
CREATE INDEX IF NOT EXISTS "Delivery_updatedAt_idx" ON "Delivery"("updatedAt");
CREATE INDEX IF NOT EXISTS "CatalogSettings_merchantId_idx" ON "CatalogSettings"("merchantId");
CREATE INDEX IF NOT EXISTS "CatalogSettings_updatedAt_idx" ON "CatalogSettings"("updatedAt");
CREATE INDEX IF NOT EXISTS "PublicCatalogOrder_merchantId_idx" ON "PublicCatalogOrder"("merchantId");
CREATE INDEX IF NOT EXISTS "PublicCatalogOrder_updatedAt_idx" ON "PublicCatalogOrder"("updatedAt");
CREATE INDEX IF NOT EXISTS "UpgradeRequest_merchantId_idx" ON "UpgradeRequest"("merchantId");
CREATE INDEX IF NOT EXISTS "UpgradeRequest_updatedAt_idx" ON "UpgradeRequest"("updatedAt");
CREATE INDEX IF NOT EXISTS "RestaurantTable_merchantId_idx" ON "RestaurantTable"("merchantId");
CREATE INDEX IF NOT EXISTS "RestaurantTable_branchId_idx" ON "RestaurantTable"("branchId");
CREATE INDEX IF NOT EXISTS "RestaurantTable_updatedAt_idx" ON "RestaurantTable"("updatedAt");
CREATE INDEX IF NOT EXISTS "KitchenTicket_merchantId_idx" ON "KitchenTicket"("merchantId");
CREATE INDEX IF NOT EXISTS "KitchenTicket_branchId_idx" ON "KitchenTicket"("branchId");
CREATE INDEX IF NOT EXISTS "KitchenTicket_updatedAt_idx" ON "KitchenTicket"("updatedAt");
CREATE INDEX IF NOT EXISTS "KitchenTicketItem_merchantId_idx" ON "KitchenTicketItem"("merchantId");
CREATE INDEX IF NOT EXISTS "KitchenTicketItem_updatedAt_idx" ON "KitchenTicketItem"("updatedAt");
CREATE INDEX IF NOT EXISTS "Modifier_merchantId_idx" ON "Modifier"("merchantId");
CREATE INDEX IF NOT EXISTS "Modifier_updatedAt_idx" ON "Modifier"("updatedAt");
CREATE INDEX IF NOT EXISTS "Order_branchId_idx" ON "Order"("branchId");
CREATE INDEX IF NOT EXISTS "Payment_branchId_idx" ON "Payment"("branchId");
CREATE INDEX IF NOT EXISTS "StockMovement_branchId_idx" ON "StockMovement"("branchId");
CREATE INDEX IF NOT EXISTS "PaynowTransaction_branchId_idx" ON "PaynowTransaction"("branchId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_activeBranchId_fkey" FOREIGN KEY ("activeBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogSettings" ADD CONSTRAINT "CatalogSettings_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicCatalogOrder" ADD CONSTRAINT "PublicCatalogOrder_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicCatalogOrder" ADD CONSTRAINT "PublicCatalogOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaynowTransaction" ADD CONSTRAINT "PaynowTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_currentPlanId_fkey" FOREIGN KEY ("currentPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_requestedPlanId_fkey" FOREIGN KEY ("requestedPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_restaurantTableId_fkey" FOREIGN KEY ("restaurantTableId") REFERENCES "RestaurantTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketItem" ADD CONSTRAINT "KitchenTicketItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketItem" ADD CONSTRAINT "KitchenTicketItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "KitchenTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketItem" ADD CONSTRAINT "KitchenTicketItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
