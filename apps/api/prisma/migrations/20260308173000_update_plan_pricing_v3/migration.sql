UPDATE "Plan"
SET "priceMonthly" = 10.00,
    "updatedAt" = NOW()
WHERE "code" = 'STARTER';

UPDATE "Plan"
SET "priceMonthly" = 15.00,
    "updatedAt" = NOW()
WHERE "code" = 'PRO';

UPDATE "Plan"
SET "priceMonthly" = 25.00,
    "updatedAt" = NOW()
WHERE "code" = 'BUSINESS';
