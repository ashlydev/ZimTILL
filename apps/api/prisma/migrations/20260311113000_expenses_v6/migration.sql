CREATE TABLE IF NOT EXISTS "Expense" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "branchId" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "payee" TEXT,
  "notes" TEXT,
  "spentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lastModifiedByDeviceId" TEXT NOT NULL DEFAULT 'server-expense',
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Expense_merchantId_idx" ON "Expense"("merchantId");
CREATE INDEX IF NOT EXISTS "Expense_branchId_idx" ON "Expense"("branchId");
CREATE INDEX IF NOT EXISTS "Expense_createdByUserId_idx" ON "Expense"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Expense_updatedByUserId_idx" ON "Expense"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "Expense_spentAt_idx" ON "Expense"("spentAt");
CREATE INDEX IF NOT EXISTS "Expense_updatedAt_idx" ON "Expense"("updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Expense_merchantId_fkey'
  ) THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Expense_branchId_fkey'
  ) THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Expense_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Expense_updatedByUserId_fkey'
  ) THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
