CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedByDeviceId" TEXT NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;

CREATE INDEX "Category_merchantId_idx" ON "Category"("merchantId");
CREATE INDEX "Category_merchantId_name_idx" ON "Category"("merchantId", "name");
CREATE INDEX "Category_updatedAt_idx" ON "Category"("updatedAt");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

ALTER TABLE "Category" ADD CONSTRAINT "Category_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Category" (
  "id",
  "merchantId",
  "createdByUserId",
  "updatedByUserId",
  "name",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "version",
  "lastModifiedByDeviceId"
)
SELECT
  gen_random_uuid()::text,
  source."merchantId",
  NULL,
  NULL,
  source."name",
  source."createdAt",
  source."updatedAt",
  NULL,
  1,
  'migration-category-backfill'
FROM (
  SELECT DISTINCT ON ("merchantId", lower(btrim("category")))
    "merchantId",
    btrim("category") AS "name",
    COALESCE("createdAt", NOW()) AS "createdAt",
    COALESCE("updatedAt", NOW()) AS "updatedAt"
  FROM "Product"
  WHERE "deletedAt" IS NULL
    AND "category" IS NOT NULL
    AND btrim("category") <> ''
  ORDER BY "merchantId", lower(btrim("category")), "updatedAt" DESC
) AS source;

UPDATE "Product" AS product
SET "categoryId" = category."id"
FROM "Category" AS category
WHERE product."categoryId" IS NULL
  AND product."merchantId" = category."merchantId"
  AND product."category" IS NOT NULL
  AND btrim(product."category") = category."name";
