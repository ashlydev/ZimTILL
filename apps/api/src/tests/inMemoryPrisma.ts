import { randomUUID } from "node:crypto";

type AnyRecord = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compareValues(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  return left === right;
}

function matchesFilter(value: unknown, condition: AnyRecord): boolean {
  if ("in" in condition) {
    return Array.isArray(condition.in) && condition.in.some((entry) => compareValues(value, entry));
  }

  if ("gt" in condition) {
    return value instanceof Date && condition.gt instanceof Date
      ? value.getTime() > condition.gt.getTime()
      : (value as number) > condition.gt;
  }

  if ("gte" in condition) {
    return value instanceof Date && condition.gte instanceof Date
      ? value.getTime() >= condition.gte.getTime()
      : (value as number) >= condition.gte;
  }

  if ("lt" in condition) {
    return value instanceof Date && condition.lt instanceof Date
      ? value.getTime() < condition.lt.getTime()
      : (value as number) < condition.lt;
  }

  if ("lte" in condition) {
    return value instanceof Date && condition.lte instanceof Date
      ? value.getTime() <= condition.lte.getTime()
      : (value as number) <= condition.lte;
  }

  if ("contains" in condition) {
    return String(value ?? "")
      .toLowerCase()
      .includes(String(condition.contains ?? "").toLowerCase());
  }

  if ("equals" in condition) {
    return compareValues(value, condition.equals);
  }

  if ("not" in condition) {
    return !matchesFilter(value, { equals: condition.not });
  }

  return compareValues(value, condition);
}

function matchesWhere(item: AnyRecord, where?: AnyRecord): boolean {
  if (!where || Object.keys(where).length === 0) return true;

  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") {
      return Array.isArray(value) && value.some((entry) => matchesWhere(item, entry));
    }

    if (key === "AND") {
      return Array.isArray(value) && value.every((entry) => matchesWhere(item, entry));
    }

    if (key === "NOT") {
      return !matchesWhere(item, value as AnyRecord);
    }

    if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      return matchesFilter(item[key], value as AnyRecord);
    }

    return compareValues(item[key], value);
  });
}

function filterByWhere(items: AnyRecord[], where?: AnyRecord) {
  return items.filter((item) => matchesWhere(item, where));
}

function sortRecords(items: AnyRecord[], orderBy?: AnyRecord | AnyRecord[]) {
  if (!orderBy) return [...items];

  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];

  return [...items].sort((left, right) => {
    for (const entry of entries) {
      const [field, direction] = Object.entries(entry)[0] ?? [];
      if (!field) continue;

      const leftValue = left[field];
      const rightValue = right[field];
      const leftComparable = leftValue instanceof Date ? leftValue.getTime() : leftValue;
      const rightComparable = rightValue instanceof Date ? rightValue.getTime() : rightValue;

      if (leftComparable === rightComparable) continue;

      const modifier = direction === "desc" ? -1 : 1;
      return leftComparable > rightComparable ? modifier : -modifier;
    }

    return 0;
  });
}

function applyData(target: AnyRecord, data: AnyRecord) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      if ("increment" in value) {
        target[key] = Number(target[key] ?? 0) + Number((value as { increment: number }).increment);
        continue;
      }

      if ("decrement" in value) {
        target[key] = Number(target[key] ?? 0) - Number((value as { decrement: number }).decrement);
        continue;
      }
    }

    target[key] = value;
  }
}

function withDefaults(data: AnyRecord, defaults: AnyRecord = {}) {
  return {
    ...defaults,
    ...clone(data)
  };
}

export function createInMemoryPrisma() {
  const merchants: AnyRecord[] = [];
  const roles: AnyRecord[] = [];
  const users: AnyRecord[] = [];
  const userAuths: AnyRecord[] = [];
  const devices: AnyRecord[] = [];
  const settings: AnyRecord[] = [];
  const featureFlags: AnyRecord[] = [];
  const auditLogs: AnyRecord[] = [];
  const syncLogs: AnyRecord[] = [];
  const products: AnyRecord[] = [];
  const productStocks: AnyRecord[] = [];
  const customers: AnyRecord[] = [];
  const orders: AnyRecord[] = [];
  const orderItems: AnyRecord[] = [];
  const payments: AnyRecord[] = [];
  const paynowTransactions: AnyRecord[] = [];
  const stockMovements: AnyRecord[] = [];
  const plans: AnyRecord[] = [];
  const subscriptions: AnyRecord[] = [];
  const usageCounters: AnyRecord[] = [];
  const branches: AnyRecord[] = [];
  const catalogSettings: AnyRecord[] = [];
  const publicCatalogOrders: AnyRecord[] = [];
  const stockTransfers: AnyRecord[] = [];
  const stockTransferItems: AnyRecord[] = [];
  const deliveries: AnyRecord[] = [];
  const upgradeRequests: AnyRecord[] = [];

  const prisma: AnyRecord = {
    $transaction: async (fn: (tx: AnyRecord) => Promise<unknown>) => fn(prisma),
    merchant: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
          deletedAt: data.deletedAt ?? null
        });
        merchants.push(next);
        return next;
      },
      findUnique: async ({ where }: AnyRecord) => merchants.find((item) => matchesWhere(item, where)) ?? null,
      findFirst: async ({ where }: AnyRecord) => filterByWhere(merchants, where)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(merchants, where), orderBy),
      count: async ({ where }: AnyRecord = {}) => filterByWhere(merchants, where).length
    },
    role: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        roles.push(next);
        return next;
      },
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = roles.find(
          (item) => item.merchantId === where.merchantId_key.merchantId && item.key === where.merchantId_key.key
        );

        if (existing) {
          applyData(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }

        const next = withDefaults(create, { createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        roles.push(next);
        return next;
      }
    },
    user: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        users.push(next);
        return next;
      },
      findFirst: async ({ where, include, orderBy }: AnyRecord) => {
        const item = sortRecords(filterByWhere(users, where), orderBy)[0] ?? null;
        if (!item || !include) return item;

        return {
          ...item,
          merchant: include.merchant ? merchants.find((entry) => entry.id === item.merchantId) ?? null : undefined,
          defaultBranch: include.defaultBranch
            ? branches.find((entry) => entry.id === item.defaultBranchId) ?? null
            : undefined
        };
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(users, where), orderBy),
      count: async ({ where }: AnyRecord = {}) => filterByWhere(users, where).length,
      update: async ({ where, data }: AnyRecord) => {
        const existing = users.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(users, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    userAuth: {
      findFirst: async ({ where, include }: AnyRecord) => {
        const item = filterByWhere(userAuths, where)[0] ?? null;
        if (!item || !include) return item;

        return {
          ...item,
          user: include.user ? users.find((entry) => entry.id === item.userId) ?? null : undefined,
          merchant: include.merchant ? merchants.find((entry) => entry.id === item.merchantId) ?? null : undefined
        };
      },
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        userAuths.push(next);
        return next;
      },
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = userAuths.find(
          (item) =>
            item.merchantId === where.merchantId_identifier.merchantId &&
            item.identifier === where.merchantId_identifier.identifier
        );

        if (existing) {
          applyData(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }

        const next = withDefaults(create, { createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        userAuths.push(next);
        return next;
      }
    },
    device: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          id: data.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          revokedAt: null
        });
        devices.push(next);
        return next;
      },
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = devices.find(
          (item) =>
            item.merchantId === where.merchantId_deviceId.merchantId &&
            item.deviceId === where.merchantId_deviceId.deviceId
        );

        if (existing) {
          applyData(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }

        const next = withDefaults(create, {
          id: create.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          revokedAt: null
        });
        devices.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(devices, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(devices, where), orderBy),
      count: async ({ where }: AnyRecord = {}) => filterByWhere(devices, where).length,
      update: async ({ where, data }: AnyRecord) => {
        const existing = devices.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(devices, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    settings: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        settings.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(settings, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(settings, where), orderBy),
      update: async ({ where, data }: AnyRecord) => {
        const existing = settings.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(settings, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    featureFlag: {
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = featureFlags.find(
          (item) => item.key === where.key_merchantId.key && item.merchantId === where.key_merchantId.merchantId
        );

        if (existing) {
          applyData(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }

        const next = withDefaults(create, {
          id: create.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        featureFlags.push(next);
        return next;
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(featureFlags, where), orderBy),
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(featureFlags, where), orderBy)[0] ?? null,
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          id: data.id ?? randomUUID(),
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
          deletedAt: data.deletedAt ?? null
        });
        featureFlags.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = featureFlags.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(featureFlags, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    auditLog: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        auditLogs.push(next);
        return next;
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(auditLogs, where), orderBy)
    },
    syncOperationLog: {
      findUnique: async ({ where }: AnyRecord) =>
        syncLogs.find(
          (item) => item.merchantId === where.merchantId_opId.merchantId && item.opId === where.merchantId_opId.opId
        ) ?? null,
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        syncLogs.push(next);
        return next;
      }
    },
    plan: {
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = plans.find((item) => item.code === where.code);
        if (existing) {
          applyData(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }

        const next = withDefaults(create, {
          id: create.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        plans.push(next);
        return next;
      },
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        plans.push(next);
        return next;
      },
      findUnique: async ({ where }: AnyRecord) => plans.find((item) => matchesWhere(item, where)) ?? null,
      findUniqueOrThrow: async ({ where }: AnyRecord) => {
        const existing = plans.find((item) => matchesWhere(item, where));
        if (!existing) {
          throw new Error("Plan not found");
        }
        return existing;
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(plans, where), orderBy)
    },
    subscription: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          id: data.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        subscriptions.push(next);
        return next;
      },
      findFirst: async ({ where, include, orderBy }: AnyRecord = {}) => {
        const item = sortRecords(filterByWhere(subscriptions, where), orderBy)[0] ?? null;
        if (!item || !include) return item;

        return {
          ...item,
          plan: include.plan ? plans.find((entry) => entry.id === item.planId) ?? null : undefined
        };
      },
      findMany: async ({ where, include, orderBy }: AnyRecord = {}) => {
        const items = sortRecords(filterByWhere(subscriptions, where), orderBy);
        if (!include?.plan) return items;
        return items.map((item) => ({ ...item, plan: plans.find((entry) => entry.id === item.planId) ?? null }));
      }
    },
    usageCounter: {
      upsert: async ({ where, create, update }: AnyRecord) => {
        const key = where.merchantId_key_periodStart_periodEnd;
        const existing = usageCounters.find(
          (item) =>
            item.merchantId === key.merchantId &&
            item.key === key.key &&
            compareValues(item.periodStart, key.periodStart) &&
            compareValues(item.periodEnd, key.periodEnd)
        );

        if (existing) {
          applyData(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }

        const next = withDefaults(create, {
          id: create.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        usageCounters.push(next);
        return next;
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(usageCounters, where), orderBy)
    },
    branch: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          id: data.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        branches.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(branches, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(branches, where), orderBy),
      count: async ({ where }: AnyRecord = {}) => filterByWhere(branches, where).length,
      update: async ({ where, data }: AnyRecord) => {
        const existing = branches.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      }
    },
    catalogSettings: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          id: data.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        catalogSettings.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) =>
        sortRecords(filterByWhere(catalogSettings, where), orderBy)[0] ?? null,
      update: async ({ where, data }: AnyRecord) => {
        const existing = catalogSettings.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        existing.updatedAt = new Date();
        return existing;
      }
    },
    publicCatalogOrder: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        publicCatalogOrders.push(next);
        return next;
      }
    },
    product: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(products, where), orderBy)[0] ?? null,
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        products.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = products.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(products, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(products, where), orderBy),
      count: async ({ where }: AnyRecord = {}) => filterByWhere(products, where).length
    },
    productStock: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, {
          id: data.id ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });
        productStocks.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) =>
        sortRecords(filterByWhere(productStocks, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(productStocks, where), orderBy),
      update: async ({ where, data }: AnyRecord) => {
        const existing = productStocks.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      count: async ({ where }: AnyRecord = {}) => filterByWhere(productStocks, where).length,
      groupBy: async ({ by, where }: AnyRecord) => {
        const items = filterByWhere(productStocks, where);
        const groups = new Map<string, AnyRecord>();

        for (const item of items) {
          const key = JSON.stringify(by.map((field: string) => item[field]));
          if (!groups.has(key)) {
            const seed: AnyRecord = {};
            by.forEach((field: string) => {
              seed[field] = item[field];
            });
            seed._count = { _all: 0 };
            groups.set(key, seed);
          }

          groups.get(key)!._count._all += 1;
        }

        return [...groups.values()];
      }
    },
    customer: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(customers, where), orderBy)[0] ?? null,
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        customers.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = customers.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(customers, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(customers, where), orderBy)
    },
    order: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(orders, where), orderBy)[0] ?? null,
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        orders.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = orders.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(orders, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(orders, where), orderBy),
      count: async ({ where }: AnyRecord = {}) => filterByWhere(orders, where).length
    },
    orderItem: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(orderItems, where), orderBy)[0] ?? null,
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        orderItems.push(next);
        return next;
      },
      createMany: async ({ data }: AnyRecord) => {
        data.forEach((item: AnyRecord) => orderItems.push(withDefaults(item)));
        return { count: data.length };
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = orderItems.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(orderItems, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(orderItems, where), orderBy)
    },
    payment: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(payments, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(payments, where), orderBy),
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        payments.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = payments.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(payments, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    paynowTransaction: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) =>
        sortRecords(filterByWhere(paynowTransactions, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(paynowTransactions, where), orderBy),
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        paynowTransactions.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = paynowTransactions.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(paynowTransactions, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    stockMovement: {
      findFirst: async ({ where, orderBy }: AnyRecord = {}) =>
        sortRecords(filterByWhere(stockMovements, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(stockMovements, where), orderBy),
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data);
        stockMovements.push(next);
        return next;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = stockMovements.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = filterByWhere(stockMovements, where);
        filtered.forEach((item) => applyData(item, data));
        return { count: filtered.length };
      }
    },
    stockTransfer: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        stockTransfers.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(stockTransfers, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(stockTransfers, where), orderBy),
      update: async ({ where, data }: AnyRecord) => {
        const existing = stockTransfers.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      }
    },
    stockTransferItem: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        stockTransferItems.push(next);
        return next;
      },
      createMany: async ({ data }: AnyRecord) => {
        data.forEach((item: AnyRecord) =>
          stockTransferItems.push(withDefaults(item, { id: item.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() }))
        );
        return { count: data.length };
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(stockTransferItems, where), orderBy)
    },
    delivery: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        deliveries.push(next);
        return next;
      },
      findFirst: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(deliveries, where), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(deliveries, where), orderBy),
      update: async ({ where, data }: AnyRecord) => {
        const existing = deliveries.find((item) => matchesWhere(item, where));
        if (!existing) return null;
        applyData(existing, data);
        return existing;
      }
    },
    upgradeRequest: {
      create: async ({ data }: AnyRecord) => {
        const next = withDefaults(data, { id: data.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date() });
        upgradeRequests.push(next);
        return next;
      },
      findMany: async ({ where, orderBy }: AnyRecord = {}) => sortRecords(filterByWhere(upgradeRequests, where), orderBy)
    }
  };

  return {
    prisma,
    state: {
      merchants,
      roles,
      users,
      userAuths,
      devices,
      settings,
      featureFlags,
      auditLogs,
      syncLogs,
      products,
      productStocks,
      customers,
      orders,
      orderItems,
      payments,
      paynowTransactions,
      stockMovements,
      plans,
      subscriptions,
      usageCounters,
      branches,
      catalogSettings,
      publicCatalogOrders,
      stockTransfers,
      stockTransferItems,
      deliveries,
      upgradeRequests
    }
  };
}
