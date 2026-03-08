-- Sync audit fields for owner/staff shared offline data

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "PaynowTransaction" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "PaynowTransaction" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;
ALTER TABLE "PaynowTransaction" ADD COLUMN IF NOT EXISTS "lastModifiedByDeviceId" TEXT;

UPDATE "PaynowTransaction"
SET "lastModifiedByDeviceId" = 'server-paynow'
WHERE "lastModifiedByDeviceId" IS NULL;

ALTER TABLE "PaynowTransaction"
ALTER COLUMN "lastModifiedByDeviceId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_createdByUserId_idx" ON "Product"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Product_updatedByUserId_idx" ON "Product"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "Customer_createdByUserId_idx" ON "Customer"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Customer_updatedByUserId_idx" ON "Customer"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "Order_createdByUserId_idx" ON "Order"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Order_updatedByUserId_idx" ON "Order"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "OrderItem_createdByUserId_idx" ON "OrderItem"("createdByUserId");
CREATE INDEX IF NOT EXISTS "OrderItem_updatedByUserId_idx" ON "OrderItem"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "Payment_createdByUserId_idx" ON "Payment"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Payment_updatedByUserId_idx" ON "Payment"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "StockMovement_createdByUserId_idx" ON "StockMovement"("createdByUserId");
CREATE INDEX IF NOT EXISTS "StockMovement_updatedByUserId_idx" ON "StockMovement"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "Settings_createdByUserId_idx" ON "Settings"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Settings_updatedByUserId_idx" ON "Settings"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "PaynowTransaction_createdByUserId_idx" ON "PaynowTransaction"("createdByUserId");
CREATE INDEX IF NOT EXISTS "PaynowTransaction_updatedByUserId_idx" ON "PaynowTransaction"("updatedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_createdByUserId_fkey') THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_updatedByUserId_fkey') THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_createdByUserId_fkey') THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_updatedByUserId_fkey') THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_createdByUserId_fkey') THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_updatedByUserId_fkey') THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_createdByUserId_fkey') THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_updatedByUserId_fkey') THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_createdByUserId_fkey') THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_updatedByUserId_fkey') THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_createdByUserId_fkey') THEN
    ALTER TABLE "StockMovement"
      ADD CONSTRAINT "StockMovement_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_updatedByUserId_fkey') THEN
    ALTER TABLE "StockMovement"
      ADD CONSTRAINT "StockMovement_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Settings_createdByUserId_fkey') THEN
    ALTER TABLE "Settings"
      ADD CONSTRAINT "Settings_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Settings_updatedByUserId_fkey') THEN
    ALTER TABLE "Settings"
      ADD CONSTRAINT "Settings_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaynowTransaction_createdByUserId_fkey') THEN
    ALTER TABLE "PaynowTransaction"
      ADD CONSTRAINT "PaynowTransaction_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaynowTransaction_updatedByUserId_fkey') THEN
    ALTER TABLE "PaynowTransaction"
      ADD CONSTRAINT "PaynowTransaction_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
