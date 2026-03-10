import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleSyncPull, handleSyncPush } from "../modules/sync/sync.service";
import { createInMemoryPrisma } from "./inMemoryPrisma";

type Actor = {
  merchantId: string;
  userId: string;
  deviceId: string;
};

function registerActor(
  state: ReturnType<typeof createInMemoryPrisma>["state"],
  actor: Actor,
  options?: { identifier?: string; role?: string; isActive?: boolean; revokedAt?: Date | null }
) {
  state.users.push({
    id: actor.userId,
    merchantId: actor.merchantId,
    identifier: options?.identifier ?? `${actor.userId}@example.com`,
    pinHash: "hash",
    role: options?.role ?? "OWNER",
    isActive: options?.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  });

  state.devices.push({
    id: randomUUID(),
    merchantId: actor.merchantId,
    userId: actor.userId,
    deviceId: actor.deviceId,
    activeBranchId: null,
    lastSeenAt: new Date(),
    revokedAt: options?.revokedAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  });
}

function sampleProduct(merchantId: string, actor: Actor, id = randomUUID()) {
  const now = new Date().toISOString();
  return {
    id,
    merchantId,
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    name: "Bread",
    price: 1,
    cost: 0.6,
    sku: "BRD-1",
    stockQty: 10,
    lowStockThreshold: 2,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: actor.deviceId
  };
}

function sampleOrder(merchantId: string, actor: Actor, id = randomUUID()) {
  const now = new Date().toISOString();
  return {
    id,
    merchantId,
    branchId: null,
    customerId: null,
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    orderNumber: `ORD-${id.slice(0, 6)}`,
    status: "DRAFT",
    documentType: "ORDER",
    source: "IN_STORE",
    subtotal: 25,
    discountAmount: 0,
    discountPercent: 0,
    total: 25,
    notes: null,
    customerName: null,
    customerPhone: null,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: actor.deviceId
  };
}

function samplePayment(merchantId: string, actor: Actor, orderId: string, id = randomUUID()) {
  const now = new Date().toISOString();
  return {
    id,
    merchantId,
    branchId: null,
    orderId,
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    amount: 25,
    method: "CASH",
    reference: "RCP-1",
    paidAt: now,
    status: "CONFIRMED",
    paynowTransactionId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: actor.deviceId
  };
}

function sampleOrderItem(merchantId: string, actor: Actor, orderId: string, productId: string, id = randomUUID()) {
  const now = new Date().toISOString();
  return {
    id,
    merchantId,
    orderId,
    productId,
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    quantity: 2,
    unitPrice: 12.5,
    lineTotal: 25,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    lastModifiedByDeviceId: actor.deviceId
  };
}

describe("sync service", () => {
  it("is idempotent for duplicate opId", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-1" };
    registerActor(state, actor);

    const operation = {
      opId: randomUUID(),
      entityType: "product",
      opType: "UPSERT",
      entityId: randomUUID(),
      payload: sampleProduct(actor.merchantId, actor),
      clientUpdatedAt: new Date().toISOString(),
      userId: actor.userId,
      deviceId: actor.deviceId
    } as const;

    const first = await handleSyncPush(prisma as never, actor, { operations: [operation] });
    const second = await handleSyncPush(prisma as never, actor, { operations: [operation] });

    expect(first.acceptedOpIds).toContain(operation.opId);
    expect(second.acceptedOpIds).toContain(operation.opId);
    expect(state.products).toHaveLength(1);
    expect(state.syncLogs.filter((entry) => entry.opId === operation.opId)).toHaveLength(1);
  });

  it("rejects cross-tenant payloads during push", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-1" };
    registerActor(state, actor);

    const operation = {
      opId: randomUUID(),
      entityType: "product",
      opType: "UPSERT",
      entityId: randomUUID(),
      payload: sampleProduct(randomUUID(), actor),
      clientUpdatedAt: new Date().toISOString(),
      userId: actor.userId,
      deviceId: actor.deviceId
    } as const;

    const result = await handleSyncPush(prisma as never, actor, { operations: [operation] });

    expect(result.acceptedOpIds).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("Cross-tenant payload rejected");
    expect(state.products).toHaveLength(0);
  });

  it("lets staff push merchant data and owner pull the same rows", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const merchantId = randomUUID();
    const owner: Actor = { merchantId, userId: randomUUID(), deviceId: "device-owner" };
    const staff: Actor = { merchantId, userId: randomUUID(), deviceId: "device-staff" };
    registerActor(state, owner, { role: "OWNER", identifier: "owner@example.com" });
    registerActor(state, staff, { role: "CASHIER", identifier: "cashier@example.com" });

    const order = sampleOrder(merchantId, staff);
    const payment = samplePayment(merchantId, staff, order.id);

    const pushed = await handleSyncPush(prisma as never, staff, {
      operations: [
        {
          opId: randomUUID(),
          entityType: "order",
          opType: "UPSERT",
          entityId: order.id,
          payload: order,
          clientUpdatedAt: order.updatedAt,
          userId: staff.userId,
          deviceId: staff.deviceId
        },
        {
          opId: randomUUID(),
          entityType: "payment",
          opType: "UPSERT",
          entityId: payment.id,
          payload: payment,
          clientUpdatedAt: payment.updatedAt,
          userId: staff.userId,
          deviceId: staff.deviceId
        }
      ]
    });

    const pulled = (await handleSyncPull(prisma as never, owner)) as {
      changes: {
        orders: Array<{ id: string; createdByUserId?: string | null }>;
        payments: Array<{ id: string; createdByUserId?: string | null }>;
      };
    };

    expect(pushed.rejected).toHaveLength(0);
    expect(pulled.changes.orders).toHaveLength(1);
    expect(pulled.changes.orders[0]?.id).toBe(order.id);
    expect(pulled.changes.orders[0]?.createdByUserId).toBe(staff.userId);
    expect(pulled.changes.payments).toHaveLength(1);
    expect(pulled.changes.payments[0]?.id).toBe(payment.id);
    expect(pulled.changes.payments[0]?.createdByUserId).toBe(staff.userId);
  });

  it("sorts parent records before child order items during push", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-sort" };
    registerActor(state, actor, { role: "CASHIER", identifier: "cashier@example.com" });

    const product = sampleProduct(actor.merchantId, actor);
    const order = sampleOrder(actor.merchantId, actor);
    const orderItem = sampleOrderItem(actor.merchantId, actor, order.id, product.id);

    const result = await handleSyncPush(prisma as never, actor, {
      operations: [
        {
          opId: randomUUID(),
          entityType: "orderItem",
          opType: "UPSERT",
          entityId: orderItem.id,
          payload: orderItem,
          clientUpdatedAt: orderItem.updatedAt,
          userId: actor.userId,
          deviceId: actor.deviceId
        },
        {
          opId: randomUUID(),
          entityType: "order",
          opType: "UPSERT",
          entityId: order.id,
          payload: order,
          clientUpdatedAt: order.updatedAt,
          userId: actor.userId,
          deviceId: actor.deviceId
        },
        {
          opId: randomUUID(),
          entityType: "product",
          opType: "UPSERT",
          entityId: product.id,
          payload: product,
          clientUpdatedAt: product.updatedAt,
          userId: actor.userId,
          deviceId: actor.deviceId
        }
      ]
    });

    expect(result.rejected).toHaveLength(0);
    expect(state.products).toHaveLength(1);
    expect(state.orders).toHaveLength(1);
    expect(state.orderItems).toHaveLength(1);
    expect(state.orderItems[0]?.orderId).toBe(order.id);
  });

  it("returns a friendly rejection when an order item arrives before its order exists", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-missing-order" };
    registerActor(state, actor, { role: "CASHIER", identifier: "cashier@example.com" });

    const product = sampleProduct(actor.merchantId, actor);
    state.products.push({
      ...product,
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt)
    });

    const orderItem = sampleOrderItem(actor.merchantId, actor, randomUUID(), product.id);
    const result = await handleSyncPush(prisma as never, actor, {
      operations: [
        {
          opId: randomUUID(),
          entityType: "orderItem",
          opType: "UPSERT",
          entityId: orderItem.id,
          payload: orderItem,
          clientUpdatedAt: orderItem.updatedAt,
          userId: actor.userId,
          deviceId: actor.deviceId
        }
      ]
    });

    expect(result.acceptedOpIds).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("Order item is waiting for its order to sync first.");
    expect(state.orderItems).toHaveLength(0);
  });

  it("returns only merchant-scoped data for pull", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actorA: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-a" };
    const actorB: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-b" };
    registerActor(state, actorA);
    registerActor(state, actorB);

    state.products.push(sampleProduct(actorA.merchantId, actorA), sampleProduct(actorB.merchantId, actorB));

    const pulled = (await handleSyncPull(prisma as never, actorA)) as {
      changes: { products: Array<{ merchantId: string }> };
    };

    expect(pulled.changes.products).toHaveLength(1);
    expect(pulled.changes.products[0]?.merchantId).toBe(actorA.merchantId);
  });

  it("accepts draft orders without confirmedAt but rejects confirmed orders missing it", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-order" };
    registerActor(state, actor);

    const draftOrder = sampleOrder(actor.merchantId, actor);
    delete (draftOrder as { confirmedAt?: string | null }).confirmedAt;

    const confirmedOrder = {
      ...sampleOrder(actor.merchantId, actor, randomUUID()),
      status: "CONFIRMED" as const
    };
    delete (confirmedOrder as { confirmedAt?: string | null }).confirmedAt;

    const result = await handleSyncPush(prisma as never, actor, {
      operations: [
        {
          opId: randomUUID(),
          entityType: "order",
          opType: "UPSERT",
          entityId: draftOrder.id,
          payload: draftOrder,
          clientUpdatedAt: draftOrder.updatedAt,
          userId: actor.userId,
          deviceId: actor.deviceId
        },
        {
          opId: randomUUID(),
          entityType: "order",
          opType: "UPSERT",
          entityId: confirmedOrder.id,
          payload: confirmedOrder,
          clientUpdatedAt: confirmedOrder.updatedAt,
          userId: actor.userId,
          deviceId: actor.deviceId
        }
      ]
    });

    expect(result.acceptedOpIds).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("confirmedAt");
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]?.id).toBe(draftOrder.id);
  });

  it("rejects sync for disabled users", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-disabled" };
    registerActor(state, actor, { isActive: false });

    await expect(handleSyncPush(prisma as never, actor, { operations: [] })).rejects.toThrow("User is disabled or missing");
    await expect(handleSyncPull(prisma as never, actor)).rejects.toThrow("User is disabled or missing");
  });

  it("rejects sync for revoked devices", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const actor: Actor = { merchantId: randomUUID(), userId: randomUUID(), deviceId: "device-revoked" };
    registerActor(state, actor, { revokedAt: new Date() });

    await expect(handleSyncPush(prisma as never, actor, { operations: [] })).rejects.toThrow("Device is revoked or missing");
    await expect(handleSyncPull(prisma as never, actor)).rejects.toThrow("Device is revoked or missing");
  });
});
