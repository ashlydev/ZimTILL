import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../lib/http";

const defaultGlobalFeatureFlags = ["RESTAURANT_MODE", "PLATFORM_ADMIN", "DELIVERY_MODE"];
const defaultMerchantFeatureFlags = ["ONLINE_CATALOG", "MULTI_BRANCH", "PAYNOW_CHECKOUT", "DELIVERY_MODE"];

const basePlans = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    code: "STARTER",
    name: "Starter",
    priceMonthly: 5,
    features: {
      catalog: true,
      deliveries: false,
      restaurant: false,
      reports: "basic"
    },
    limits: {
      ordersPerMonth: 300,
      products: 200,
      users: 3,
      branches: 1,
      devices: 3,
      catalogViews: 5000,
      checkouts: 300
    }
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    code: "PRO",
    name: "Pro",
    priceMonthly: 10,
    features: {
      catalog: true,
      deliveries: true,
      restaurant: false,
      reports: "advanced"
    },
    limits: {
      ordersPerMonth: 1500,
      products: 1500,
      users: 10,
      branches: 3,
      devices: 10,
      catalogViews: 25000,
      checkouts: 1500
    }
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    code: "BUSINESS",
    name: "Business",
    priceMonthly: 20,
    features: {
      catalog: true,
      deliveries: true,
      restaurant: true,
      reports: "advanced"
    },
    limits: {
      ordersPerMonth: 5000,
      products: 5000,
      users: 30,
      branches: 10,
      devices: 30,
      catalogViews: 100000,
      checkouts: 5000
    }
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    code: "ENTERPRISE",
    name: "Enterprise",
    priceMonthly: 0,
    features: {
      catalog: true,
      deliveries: true,
      restaurant: true,
      reports: "enterprise"
    },
    limits: {
      ordersPerMonth: 999999,
      products: 999999,
      users: 999,
      branches: 999,
      devices: 999,
      catalogViews: 999999,
      checkouts: 999999
    }
  }
];

function monthWindow(date = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "merchant";
}

export async function ensureBasePlans(prisma: PrismaClient | Prisma.TransactionClient): Promise<void> {
  for (const plan of basePlans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        features: plan.features as Prisma.InputJsonValue,
        limits: plan.limits as Prisma.InputJsonValue
      },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        features: plan.features as Prisma.InputJsonValue,
        limits: plan.limits as Prisma.InputJsonValue
      }
    });
  }
}

export async function ensureMerchantBootstrap(
  prisma: Prisma.TransactionClient,
  input: {
    merchantId: string;
    merchantName: string;
    merchantSlug: string;
    ownerUserId: string;
    deviceId: string;
    contactPhone?: string | null;
  }
): Promise<{ defaultBranchId: string; subscriptionId: string }> {
  await ensureBasePlans(prisma);

  for (const key of defaultGlobalFeatureFlags) {
    const existing = await prisma.featureFlag.findFirst({
      where: {
        key,
        merchantId: null,
        deletedAt: null
      }
    });

    if (!existing) {
      await prisma.featureFlag.create({
        data: { key, merchantId: null, enabled: key !== "RESTAURANT_MODE" }
      });
    }
  }

  for (const key of defaultMerchantFeatureFlags) {
    await prisma.featureFlag.upsert({
      where: { key_merchantId: { key, merchantId: input.merchantId } },
      create: { key, merchantId: input.merchantId, enabled: true },
      update: {}
    });
  }

  const branch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      merchantId: input.merchantId,
      name: "Main Branch",
      address: null,
      phone: input.contactPhone ?? null,
      isDefault: true
    }
  });

  const starterPlan = await prisma.plan.findUniqueOrThrow({ where: { code: "STARTER" } });
  const { periodStart, periodEnd } = monthWindow();

  const subscription = await prisma.subscription.create({
    data: {
      id: randomUUID(),
      merchantId: input.merchantId,
      planId: starterPlan.id,
      status: "TRIALING",
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd
    }
  });

  await prisma.catalogSettings.create({
    data: {
      id: randomUUID(),
      merchantId: input.merchantId,
      merchantSlug: input.merchantSlug,
      isEnabled: false,
      headline: input.merchantName,
      description: "Browse products, request checkout, and pay via EcoCash or Paynow.",
      checkoutPolicy: "CONFIRM_ON_PAID",
      lastModifiedByDeviceId: input.deviceId
    }
  });

  return {
    defaultBranchId: branch.id,
    subscriptionId: subscription.id
  };
}

export async function getActiveSubscription(prisma: PrismaClient | Prisma.TransactionClient, merchantId: string) {
  return prisma.subscription.findFirst({
    where: { merchantId },
    include: { plan: true },
    orderBy: { updatedAt: "desc" }
  });
}

export async function incrementUsageCounter(
  prisma: PrismaClient | Prisma.TransactionClient,
  merchantId: string,
  key: string,
  amount = 1,
  at = new Date()
): Promise<void> {
  const { periodStart, periodEnd } = monthWindow(at);

  await prisma.usageCounter.upsert({
    where: {
      merchantId_key_periodStart_periodEnd: {
        merchantId,
        key,
        periodStart,
        periodEnd
      }
    },
    create: {
      id: randomUUID(),
      merchantId,
      key,
      periodStart,
      periodEnd,
      count: amount
    },
    update: {
      count: { increment: amount }
    }
  });
}

type LimitKey = "products" | "users" | "branches" | "devices";

async function getCurrentCount(prisma: PrismaClient | Prisma.TransactionClient, merchantId: string, key: LimitKey): Promise<number> {
  switch (key) {
    case "products":
      return prisma.product.count({ where: { merchantId, deletedAt: null } });
    case "users":
      return prisma.user.count({ where: { merchantId, deletedAt: null, isActive: true } });
    case "branches":
      return prisma.branch.count({ where: { merchantId, deletedAt: null } });
    case "devices":
      return prisma.device.count({ where: { merchantId, deletedAt: null, revokedAt: null } });
  }
}

export async function assertPlanLimit(
  prisma: PrismaClient | Prisma.TransactionClient,
  merchantId: string,
  key: LimitKey,
  nextIncrement = 1
): Promise<void> {
  const subscription = await getActiveSubscription(prisma, merchantId);
  const rawLimits = (subscription?.plan?.limits ?? {}) as Record<string, unknown>;
  const limitValue = Number(rawLimits[key] ?? 0);

  if (!limitValue || Number.isNaN(limitValue)) {
    return;
  }

  const current = await getCurrentCount(prisma, merchantId, key);
  if (current + nextIncrement > limitValue) {
    throw new HttpError(402, `Plan limit reached for ${key}`);
  }
}

export async function getUsageSnapshot(prisma: PrismaClient | Prisma.TransactionClient, merchantId: string) {
  const { periodStart, periodEnd } = monthWindow();
  const [subscription, usageCounters, counts] = await Promise.all([
    getActiveSubscription(prisma, merchantId),
    prisma.usageCounter.findMany({
      where: { merchantId, periodStart, periodEnd },
      orderBy: { key: "asc" }
    }),
    Promise.all([
      prisma.product.count({ where: { merchantId, deletedAt: null } }),
      prisma.user.count({ where: { merchantId, deletedAt: null, isActive: true } }),
      prisma.branch.count({ where: { merchantId, deletedAt: null } }),
      prisma.device.count({ where: { merchantId, deletedAt: null, revokedAt: null } })
    ])
  ]);

  return {
    subscription,
    usageCounters,
    current: {
      products: counts[0],
      users: counts[1],
      branches: counts[2],
      devices: counts[3]
    }
  };
}
