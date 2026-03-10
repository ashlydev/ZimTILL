DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchasestatus') THEN
    CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stocktakestatus') THEN
    CREATE TYPE "StockTakeStatus" AS ENUM ('DRAFT', 'FINALIZED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cashupstatus') THEN
    CREATE TYPE "CashUpStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationtype') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'LOW_STOCK',
      'OUT_OF_STOCK',
      'STOCK_TAKE_COMPLETED',
      'STOCK_VARIANCE',
      'SALE_COMPLETED',
      'CASH_UP_SUBMITTED',
      'CASH_UP_VARIANCE',
      'RETURN_CREATED',
      'DAMAGED_CREATED',
      'EXPIRED_CREATED',
      'SUSPICIOUS_ACTIVITY',
      'PURCHASE_RECEIVED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-supplier',
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Purchase" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "supplierId" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "reference" TEXT,
  "notes" TEXT,
  "totalCost" DECIMAL(12,2) NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-purchase',
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PurchaseItem" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-purchase-item',
  CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTakeSession" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "categoryId" TEXT,
  "status" "StockTakeStatus" NOT NULL DEFAULT 'DRAFT',
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "countedByUserId" TEXT,
  "finalizedByUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  "varianceQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "varianceValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-stocktake',
  CONSTRAINT "StockTakeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTakeItem" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "systemQty" DECIMAL(12,3) NOT NULL,
  "countedQty" DECIMAL(12,3) NOT NULL,
  "varianceQty" DECIMAL(12,3) NOT NULL,
  "varianceValue" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-stocktake-item',
  CONSTRAINT "StockTakeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashUpSession" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "userId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "status" "CashUpStatus" NOT NULL DEFAULT 'OPEN',
  "openingFloat" DECIMAL(12,2) NOT NULL,
  "expectedCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "countedCash" DECIMAL(12,2),
  "variance" DECIMAL(12,2),
  "notes" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-cashup',
  CONSTRAINT "CashUpSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AppNotification" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "userId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "visibility" TEXT NOT NULL DEFAULT 'MANAGEMENT',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Supplier_merchantId_idx" ON "Supplier"("merchantId");
CREATE INDEX IF NOT EXISTS "Supplier_branchId_idx" ON "Supplier"("branchId");
CREATE INDEX IF NOT EXISTS "Supplier_updatedAt_idx" ON "Supplier"("updatedAt");

CREATE INDEX IF NOT EXISTS "Purchase_merchantId_idx" ON "Purchase"("merchantId");
CREATE INDEX IF NOT EXISTS "Purchase_branchId_idx" ON "Purchase"("branchId");
CREATE INDEX IF NOT EXISTS "Purchase_supplierId_idx" ON "Purchase"("supplierId");
CREATE INDEX IF NOT EXISTS "Purchase_updatedAt_idx" ON "Purchase"("updatedAt");

CREATE INDEX IF NOT EXISTS "PurchaseItem_merchantId_idx" ON "PurchaseItem"("merchantId");
CREATE INDEX IF NOT EXISTS "PurchaseItem_updatedAt_idx" ON "PurchaseItem"("updatedAt");

CREATE INDEX IF NOT EXISTS "StockTakeSession_merchantId_idx" ON "StockTakeSession"("merchantId");
CREATE INDEX IF NOT EXISTS "StockTakeSession_branchId_idx" ON "StockTakeSession"("branchId");
CREATE INDEX IF NOT EXISTS "StockTakeSession_categoryId_idx" ON "StockTakeSession"("categoryId");
CREATE INDEX IF NOT EXISTS "StockTakeSession_updatedAt_idx" ON "StockTakeSession"("updatedAt");

CREATE INDEX IF NOT EXISTS "StockTakeItem_merchantId_idx" ON "StockTakeItem"("merchantId");
CREATE INDEX IF NOT EXISTS "StockTakeItem_updatedAt_idx" ON "StockTakeItem"("updatedAt");

CREATE INDEX IF NOT EXISTS "CashUpSession_merchantId_idx" ON "CashUpSession"("merchantId");
CREATE INDEX IF NOT EXISTS "CashUpSession_branchId_idx" ON "CashUpSession"("branchId");
CREATE INDEX IF NOT EXISTS "CashUpSession_updatedAt_idx" ON "CashUpSession"("updatedAt");

CREATE INDEX IF NOT EXISTS "AppNotification_merchantId_idx" ON "AppNotification"("merchantId");
CREATE INDEX IF NOT EXISTS "AppNotification_branchId_idx" ON "AppNotification"("branchId");
CREATE INDEX IF NOT EXISTS "AppNotification_userId_idx" ON "AppNotification"("userId");
CREATE INDEX IF NOT EXISTS "AppNotification_updatedAt_idx" ON "AppNotification"("updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Supplier_merchantId_fkey'
  ) THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Supplier_branchId_fkey'
  ) THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Supplier_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Supplier_updatedByUserId_fkey'
  ) THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_merchantId_fkey'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_branchId_fkey'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_supplierId_fkey'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_updatedByUserId_fkey'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseItem_merchantId_fkey'
  ) THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseItem_purchaseId_fkey'
  ) THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseItem_productId_fkey'
  ) THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeSession_merchantId_fkey'
  ) THEN
    ALTER TABLE "StockTakeSession" ADD CONSTRAINT "StockTakeSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeSession_branchId_fkey'
  ) THEN
    ALTER TABLE "StockTakeSession" ADD CONSTRAINT "StockTakeSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeSession_categoryId_fkey'
  ) THEN
    ALTER TABLE "StockTakeSession" ADD CONSTRAINT "StockTakeSession_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeSession_countedByUserId_fkey'
  ) THEN
    ALTER TABLE "StockTakeSession" ADD CONSTRAINT "StockTakeSession_countedByUserId_fkey" FOREIGN KEY ("countedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeSession_finalizedByUserId_fkey'
  ) THEN
    ALTER TABLE "StockTakeSession" ADD CONSTRAINT "StockTakeSession_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeItem_merchantId_fkey'
  ) THEN
    ALTER TABLE "StockTakeItem" ADD CONSTRAINT "StockTakeItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeItem_sessionId_fkey'
  ) THEN
    ALTER TABLE "StockTakeItem" ADD CONSTRAINT "StockTakeItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StockTakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockTakeItem_productId_fkey'
  ) THEN
    ALTER TABLE "StockTakeItem" ADD CONSTRAINT "StockTakeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CashUpSession_merchantId_fkey'
  ) THEN
    ALTER TABLE "CashUpSession" ADD CONSTRAINT "CashUpSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CashUpSession_branchId_fkey'
  ) THEN
    ALTER TABLE "CashUpSession" ADD CONSTRAINT "CashUpSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CashUpSession_userId_fkey'
  ) THEN
    ALTER TABLE "CashUpSession" ADD CONSTRAINT "CashUpSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CashUpSession_approvedByUserId_fkey'
  ) THEN
    ALTER TABLE "CashUpSession" ADD CONSTRAINT "CashUpSession_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AppNotification_merchantId_fkey'
  ) THEN
    ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AppNotification_branchId_fkey'
  ) THEN
    ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AppNotification_userId_fkey'
  ) THEN
    ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
