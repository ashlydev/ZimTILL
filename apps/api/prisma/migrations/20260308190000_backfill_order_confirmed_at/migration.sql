UPDATE "Order"
SET "confirmedAt" = COALESCE("updatedAt", "createdAt")
WHERE "status" IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID')
  AND "confirmedAt" IS NULL
  AND "deletedAt" IS NULL;
