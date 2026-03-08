import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPublicCatalogCheckout } from "../modules/catalog/catalog.service";
import { createInMemoryPrisma } from "./inMemoryPrisma";

describe("public catalog checkout", () => {
  it("creates a customer, order, order items, and public catalog record", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const now = new Date("2026-03-08T10:00:00.000Z");
    const merchantId = randomUUID();
    const branchId = randomUUID();
    const productA = randomUUID();
    const productB = randomUUID();

    state.merchants.push({
      id: merchantId,
      name: "Acme Hardware",
      slug: "acme-hardware",
      email: "owner@acme.test",
      phone: "+263771111111",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    });

    state.branches.push({
      id: branchId,
      merchantId,
      name: "Main Branch",
      address: null,
      phone: null,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    });

    state.catalogSettings.push({
      id: randomUUID(),
      merchantId,
      merchantSlug: "acme-hardware",
      isEnabled: true,
      headline: "Acme Hardware",
      description: "Tools and supplies",
      checkoutPolicy: "CONFIRM_ON_CREATE",
      version: 1,
      lastModifiedByDeviceId: "catalog-web",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    });

    state.products.push(
      {
        id: productA,
        merchantId,
        name: "Hammer",
        category: "Tools",
        price: 12,
        cost: 8,
        sku: "HAM-1",
        stockQty: 10,
        lowStockThreshold: 2,
        isPublished: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
        lastModifiedByDeviceId: "catalog-web"
      },
      {
        id: productB,
        merchantId,
        name: "Nails",
        category: "Fasteners",
        price: 3,
        cost: 1,
        sku: "NAL-1",
        stockQty: 50,
        lowStockThreshold: 5,
        isPublished: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
        lastModifiedByDeviceId: "catalog-web"
      }
    );

    const result = await createPublicCatalogCheckout(prisma as never, "acme-hardware", {
      customerName: "Jane Buyer",
      customerPhone: "+263772222222",
      notes: "Call on arrival",
      paymentMode: "PAY_LATER",
      items: [
        { productId: productA, quantity: 2 },
        { productId: productB, quantity: 4 }
      ]
    });

    expect(result.order.source).toBe("ONLINE");
    expect(result.order.status).toBe("CONFIRMED");
    expect(result.order.total).toBe(36);

    expect(state.customers).toHaveLength(1);
    expect(state.orders).toHaveLength(1);
    expect(state.orderItems).toHaveLength(2);
    expect(state.publicCatalogOrders).toHaveLength(1);
    expect(state.usageCounters.some((entry) => entry.key === "checkouts")).toBe(true);
  });
});
