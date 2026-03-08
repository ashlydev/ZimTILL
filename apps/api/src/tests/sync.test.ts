import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleSyncPull, handleSyncPush } from "../modules/sync/sync.service";
import { createInMemoryPrisma } from "./inMemoryPrisma";

function sampleProduct(merchantId: string, id = randomUUID()) {
  const now = new Date().toISOString();
  return {
    id,
    merchantId,
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
    lastModifiedByDeviceId: "device-test"
  };
}

describe("sync service", () => {
  it("is idempotent for duplicate opId", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const merchantId = randomUUID();

    const operation = {
      opId: randomUUID(),
      entityType: "product",
      opType: "UPSERT",
      entityId: randomUUID(),
      payload: sampleProduct(merchantId),
      clientUpdatedAt: new Date().toISOString()
    } as const;

    const first = await handleSyncPush(prisma as never, merchantId, { operations: [operation] });
    const second = await handleSyncPush(prisma as never, merchantId, { operations: [operation] });

    expect(first.acceptedOpIds).toContain(operation.opId);
    expect(second.acceptedOpIds).toContain(operation.opId);
    expect(state.products).toHaveLength(1);
  });

  it("rejects cross-tenant payloads during push", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const merchantId = randomUUID();

    const operation = {
      opId: randomUUID(),
      entityType: "product",
      opType: "UPSERT",
      entityId: randomUUID(),
      payload: sampleProduct(randomUUID()),
      clientUpdatedAt: new Date().toISOString()
    } as const;

    const result = await handleSyncPush(prisma as never, merchantId, { operations: [operation] });

    expect(result.acceptedOpIds).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("Cross-tenant payload rejected");
    expect(state.products).toHaveLength(0);
  });

  it("returns only merchant-scoped data for pull", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const merchantA = randomUUID();
    const merchantB = randomUUID();

    state.products.push(sampleProduct(merchantA), sampleProduct(merchantB));

    const pulled = (await handleSyncPull(prisma as never, merchantA)) as {
      changes: { products: Array<{ merchantId: string }> };
    };

    expect(pulled.changes.products).toHaveLength(1);
    expect(pulled.changes.products[0].merchantId).toBe(merchantA);
  });
});
