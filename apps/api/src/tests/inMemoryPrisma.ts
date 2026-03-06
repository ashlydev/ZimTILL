import { randomUUID } from "node:crypto";

type AnyRecord = Record<string, any>;

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
  const customers: AnyRecord[] = [];
  const orders: AnyRecord[] = [];
  const orderItems: AnyRecord[] = [];
  const payments: AnyRecord[] = [];
  const stockMovements: AnyRecord[] = [];

  function findByWhere(items: AnyRecord[], where: AnyRecord) {
    return items.find((item) =>
      Object.entries(where).every(([key, value]) => {
        if (typeof value === "object" && value !== null && "in" in value) {
          return (value as { in: unknown[] }).in.includes(item[key]);
        }
        return item[key] === value;
      })
    );
  }

  function filterByWhere(items: AnyRecord[], where: AnyRecord) {
    return items.filter((item) =>
      Object.entries(where).every(([key, value]) => {
        if (typeof value === "object" && value !== null && "gt" in value) {
          return item[key] > (value as { gt: Date }).gt;
        }
        if (typeof value === "object" && value !== null && "in" in value) {
          return (value as { in: unknown[] }).in.includes(item[key]);
        }
        if (typeof value === "object" && value !== null && "contains" in value) {
          return String(item[key] ?? "").toLowerCase().includes(String((value as { contains: string }).contains).toLowerCase());
        }
        return item[key] === value;
      })
    );
  }

  const prisma: AnyRecord = {
    $transaction: async (fn: (tx: AnyRecord) => Promise<unknown>) => fn(prisma),
    merchant: {
      create: async ({ data }: AnyRecord) => {
        merchants.push({ ...data, createdAt: data.createdAt ?? new Date(), updatedAt: data.updatedAt ?? new Date() });
        return merchants[merchants.length - 1];
      },
      findUnique: async ({ where }: AnyRecord) => findByWhere(merchants, where)
    },
    role: {
      create: async ({ data }: AnyRecord) => {
        roles.push({ ...data, createdAt: new Date(), updatedAt: new Date() });
        return roles[roles.length - 1];
      },
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = roles.find(
          (item) => item.merchantId === where.merchantId_key.merchantId && item.key === where.merchantId_key.key
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }

        const next = { ...create, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
        roles.push(next);
        return next;
      }
    },
    user: {
      create: async ({ data }: AnyRecord) => {
        users.push({ ...data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        return users[users.length - 1];
      },
      findFirst: async ({ where, include }: AnyRecord) => {
        const item = findByWhere(users, where);
        if (!item) return null;
        if (!include) return item;
        return {
          ...item,
          merchant: include.merchant ? merchants.find((m) => m.id === item.merchantId) : undefined
        };
      }
    },
    userAuth: {
      findFirst: async ({ where, include }: AnyRecord) => {
        const item = findByWhere(userAuths, where);
        if (!item) return null;
        if (!include) return item;
        return {
          ...item,
          user: users.find((u) => u.id === item.userId),
          merchant: merchants.find((m) => m.id === item.merchantId)
        };
      },
      create: async ({ data }: AnyRecord) => {
        userAuths.push({ ...data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        return userAuths[userAuths.length - 1];
      },
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = userAuths.find(
          (item) =>
            item.merchantId === where.merchantId_identifier.merchantId &&
            item.identifier === where.merchantId_identifier.identifier
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }

        const next = { ...create, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
        userAuths.push(next);
        return next;
      }
    },
    device: {
      create: async ({ data }: AnyRecord) => {
        devices.push({ ...data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, revokedAt: null });
        return devices[devices.length - 1];
      },
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = devices.find(
          (item) =>
            item.merchantId === where.merchantId_deviceId.merchantId &&
            item.deviceId === where.merchantId_deviceId.deviceId
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const next = { ...create, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, revokedAt: null };
        devices.push(next);
        return next;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        let count = 0;
        for (const device of devices) {
          if (device.merchantId === where.merchantId && device.deviceId === where.deviceId) {
            Object.assign(device, data);
            count += 1;
          }
        }
        return { count };
      }
    },
    settings: {
      create: async ({ data }: AnyRecord) => {
        settings.push(data);
        return data;
      },
      findFirst: async ({ where }: AnyRecord) => findByWhere(settings, where),
      findMany: async ({ where }: AnyRecord) => filterByWhere(settings, where),
      update: async ({ where, data }: AnyRecord) => {
        const existing = settings.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = settings.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      }
    },
    featureFlag: {
      upsert: async ({ where, create, update }: AnyRecord) => {
        const existing = featureFlags.find(
          (item) => item.key === where.key_merchantId.key && item.merchantId === where.key_merchantId.merchantId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        featureFlags.push({ id: randomUUID(), ...create, createdAt: new Date(), updatedAt: new Date(), deletedAt: null });
        return featureFlags[featureFlags.length - 1];
      },
      findMany: async ({ where }: AnyRecord) => {
        if (where?.OR) {
          return featureFlags.filter((flag) =>
            where.OR.some((condition: AnyRecord) => {
              if (condition.merchantId === null) return flag.merchantId === null;
              return flag.merchantId === condition.merchantId;
            })
          );
        }
        return filterByWhere(featureFlags, where);
      },
      findFirst: async ({ where }: AnyRecord) => findByWhere(featureFlags, where),
      create: async ({ data }: AnyRecord) => {
        featureFlags.push(data);
        return data;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = featureFlags.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const filtered = featureFlags.filter((item) => item.id === where.id);
        filtered.forEach((item) => Object.assign(item, data));
        return { count: filtered.length };
      }
    },
    auditLog: {
      create: async ({ data }: AnyRecord) => {
        auditLogs.push({ id: randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() });
        return auditLogs[auditLogs.length - 1];
      }
    },
    syncOperationLog: {
      findUnique: async ({ where }: AnyRecord) => {
        return syncLogs.find(
          (item) => item.merchantId === where.merchantId_opId.merchantId && item.opId === where.merchantId_opId.opId
        );
      },
      create: async ({ data }: AnyRecord) => {
        syncLogs.push({ id: randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() });
        return syncLogs[syncLogs.length - 1];
      }
    },
    product: {
      findFirst: async ({ where }: AnyRecord) => findByWhere(products, where),
      create: async ({ data }: AnyRecord) => {
        products.push(data);
        return data;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = products.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = products.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      },
      findMany: async ({ where }: AnyRecord) => filterByWhere(products, where)
    },
    customer: {
      findFirst: async ({ where }: AnyRecord) => findByWhere(customers, where),
      create: async ({ data }: AnyRecord) => {
        customers.push(data);
        return data;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = customers.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = customers.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      },
      findMany: async ({ where }: AnyRecord) => filterByWhere(customers, where)
    },
    order: {
      findFirst: async ({ where }: AnyRecord) => findByWhere(orders, where),
      create: async ({ data }: AnyRecord) => {
        orders.push(data);
        return data;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = orders.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = orders.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      },
      findMany: async ({ where }: AnyRecord) => filterByWhere(orders, where),
      count: async ({ where }: AnyRecord) => filterByWhere(orders, where).length
    },
    orderItem: {
      findFirst: async ({ where }: AnyRecord) => findByWhere(orderItems, where),
      create: async ({ data }: AnyRecord) => {
        orderItems.push(data);
        return data;
      },
      createMany: async ({ data }: AnyRecord) => {
        data.forEach((item: AnyRecord) => orderItems.push(item));
        return { count: data.length };
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = orderItems.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = orderItems.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      },
      findMany: async ({ where }: AnyRecord) => filterByWhere(orderItems, where)
    },
    payment: {
      findFirst: async ({ where }: AnyRecord) => findByWhere(payments, where),
      findMany: async ({ where }: AnyRecord) => filterByWhere(payments, where),
      create: async ({ data }: AnyRecord) => {
        payments.push(data);
        return data;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = payments.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = payments.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      }
    },
    stockMovement: {
      findFirst: async ({ where }: AnyRecord) => findByWhere(stockMovements, where),
      findMany: async ({ where }: AnyRecord) => filterByWhere(stockMovements, where),
      create: async ({ data }: AnyRecord) => {
        stockMovements.push(data);
        return data;
      },
      update: async ({ where, data }: AnyRecord) => {
        const existing = stockMovements.find((item) => item.id === where.id);
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: AnyRecord) => {
        const existing = stockMovements.find((item) => item.id === where.id && item.merchantId === where.merchantId);
        if (existing) Object.assign(existing, data);
        return { count: existing ? 1 : 0 };
      }
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
      customers,
      orders,
      orderItems,
      payments,
      stockMovements
    }
  };
}
