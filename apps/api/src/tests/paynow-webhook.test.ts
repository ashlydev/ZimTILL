import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "../config/env";
import { handlePaynowWebhook } from "../modules/payments/paynow.service";
import { createInMemoryPrisma } from "./inMemoryPrisma";

function signPayload(payload: Record<string, unknown>, key: string) {
  const keys = Object.keys(payload).sort((left, right) => left.localeCompare(right));
  const concatenated = keys.map((entry) => String(payload[entry] ?? "")).join("");

  return createHash("sha512")
    .update(concatenated + key)
    .digest("hex")
    .toUpperCase();
}

describe("Paynow webhook handling", () => {
  beforeEach(() => {
    (env as typeof env & { PAYNOW_INTEGRATION_KEY: string }).PAYNOW_INTEGRATION_KEY = "test-paynow-key";
  });

  it("is idempotent when the same paid webhook is received twice", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const merchantId = randomUUID();
    const orderId = randomUUID();
    const transactionId = randomUUID();
    const reference = "NVO-TEST-12345";
    const now = new Date("2026-03-08T10:00:00.000Z");

    state.orders.push({
      id: orderId,
      merchantId,
      orderNumber: "ORD-1001",
      status: "CONFIRMED",
      subtotal: 25,
      discountAmount: 0,
      discountPercent: 0,
      total: 25,
      notes: null,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      lastModifiedByDeviceId: "device-1"
    });

    state.paynowTransactions.push({
      id: transactionId,
      merchantId,
      orderId,
      amount: 25,
      method: "ecocash",
      phone: "+263772222222",
      reference,
      pollUrl: "https://example.com/poll",
      redirectUrl: null,
      status: "CREATED",
      rawInitResponse: {},
      rawLastStatus: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    });

    state.payments.push({
      id: randomUUID(),
      merchantId,
      orderId,
      amount: 25,
      method: "PAYNOW",
      reference,
      paidAt: now,
      status: "PENDING",
      paynowTransactionId: transactionId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      lastModifiedByDeviceId: "device-1"
    });

    const unsignedPayload = {
      reference,
      status: "Paid",
      paid: "true"
    };
    const payload = {
      ...unsignedPayload,
      hash: signPayload(unsignedPayload, env.PAYNOW_INTEGRATION_KEY)
    };

    await handlePaynowWebhook(prisma as never, payload);
    await handlePaynowWebhook(prisma as never, payload);

    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]?.status).toBe("CONFIRMED");
    expect(state.orders[0]?.status).toBe("PAID");
    expect(state.paynowTransactions[0]?.status).toBe("PAID");
  });
});
