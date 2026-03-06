-- V2 staff + paynow hardening
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Idempotency guard for Paynow webhook/status retries (one active payment per paynow txn)
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_paynowTransactionId_active_key"
ON "Payment"("paynowTransactionId")
WHERE "paynowTransactionId" IS NOT NULL AND "deletedAt" IS NULL;
