import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { Paynow } from "paynow";
import { paynowInitiateSchema, paynowStatusSchema, PaynowMethod, PaynowNormalizedStatus } from "@novoriq/shared";
import { env } from "../../config/env";
import { HttpError } from "../../lib/http";
import { updateOrderPaymentStatus } from "../orders/order-utils";

function requirePaynowClient(): Paynow {
  if (
    !env.PAYNOW_INTEGRATION_ID ||
    !env.PAYNOW_INTEGRATION_KEY ||
    !env.PAYNOW_RESULT_URL ||
    !env.PAYNOW_RETURN_URL
  ) {
    throw new HttpError(500, "Paynow environment variables are not fully configured");
  }

  return new Paynow(
    env.PAYNOW_INTEGRATION_ID,
    env.PAYNOW_INTEGRATION_KEY,
    env.PAYNOW_RESULT_URL,
    env.PAYNOW_RETURN_URL
  );
}

function normalizeStatus(rawStatus: string | undefined, paidFlag?: boolean): PaynowNormalizedStatus {
  if (paidFlag) return "PAID";
  const status = (rawStatus ?? "").toLowerCase();

  if (["paid", "awaiting delivery"].some((item) => status.includes(item))) return "PAID";
  if (["created", "sent", "awaiting", "pending", "queued"].some((item) => status.includes(item))) return "AWAITING";
  if (["cancelled", "canceled"].some((item) => status.includes(item))) return "CANCELLED";
  if (["failed", "error", "rejected"].some((item) => status.includes(item))) return "FAILED";

  return "UNKNOWN";
}

function paymentInstructions(method: PaynowMethod): string {
  if (method === "ecocash" || method === "onemoney") {
    return "Approve the mobile money prompt on your phone, then tap Check payment status.";
  }
  if (method === "web" || method === "card") {
    return "Complete checkout in the opened browser, then return and sync or check status.";
  }
  return "Follow Paynow payment instructions and check status after completion.";
}

function statusMessage(status: PaynowNormalizedStatus): string {
  if (status === "PAID") return "Payment confirmed. Order balance is updated.";
  if (status === "AWAITING") return "Payment is awaiting customer completion.";
  if (status === "FAILED") return "Payment failed. Ask customer to retry.";
  if (status === "CANCELLED") return "Payment was cancelled.";
  return "Payment status is not yet recognized. Retry shortly.";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function extractProviderError(error: unknown): string {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Paynow request failed";
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function applyPaidStatus(
  prisma: PrismaClient,
  merchantId: string,
  transactionId: string,
  options: { deviceId?: string; userId?: string } = {}
) {
  const deviceId = options.deviceId ?? "server-sync";
  const userId = options.userId ?? null;
  const txn = await prisma.paynowTransaction.findFirst({
    where: { id: transactionId, merchantId, deletedAt: null }
  });

  if (!txn) {
    throw new HttpError(404, "Transaction not found");
  }

  await prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findFirst({
      where: {
        merchantId,
        orderId: txn.orderId,
        paynowTransactionId: txn.id,
        deletedAt: null
      }
    });

    if (existingPayment) {
      await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: "CONFIRMED",
          method: "PAYNOW",
          updatedAt: new Date(),
          updatedByUserId: userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: deviceId
        }
      });
    } else {
      const now = new Date();
      try {
        await tx.payment.create({
          data: {
            id: randomUUID(),
            merchantId,
            orderId: txn.orderId,
            createdByUserId: userId,
            updatedByUserId: userId,
            amount: txn.amount,
            method: "PAYNOW",
            reference: txn.reference,
            paidAt: now,
            status: "CONFIRMED",
            paynowTransactionId: txn.id,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: deviceId
          }
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
      }
    }

    await tx.paynowTransaction.update({
      where: { id: txn.id },
      data: {
        status: "PAID",
        updatedAt: new Date(),
        updatedByUserId: userId,
        lastModifiedByDeviceId: deviceId
      }
    });
  });

  await updateOrderPaymentStatus(prisma, txn.orderId, merchantId, { userId, deviceId });
}

export async function initiatePaynow(
  prisma: PrismaClient,
  merchantId: string,
  identifier: string,
  payload: unknown
): Promise<{ transactionId: string; pollUrl: string; redirectUrl?: string; instructions: string }> {
  const body = paynowInitiateSchema.parse(payload);
  const rawBranchId =
    typeof payload === "object" && payload && "branchId" in payload ? (payload as { branchId?: unknown }).branchId : null;
  const rawUserId =
    typeof payload === "object" && payload && "userId" in payload ? (payload as { userId?: unknown }).userId : null;
  const rawDeviceId =
    typeof payload === "object" && payload && "deviceId" in payload ? (payload as { deviceId?: unknown }).deviceId : null;
  const branchId = typeof rawBranchId === "string" && rawBranchId.trim().length > 0 ? rawBranchId : null;
  const userId = typeof rawUserId === "string" && rawUserId.trim().length > 0 ? rawUserId : null;
  const deviceId = typeof rawDeviceId === "string" && rawDeviceId.trim().length > 0 ? rawDeviceId : "server-paynow";
  const order = await prisma.order.findFirst({
    where: {
      id: body.orderId,
      merchantId,
      deletedAt: null
    }
  });

  if (!order) {
    throw new HttpError(404, "Order not found");
  }

  if (body.amount > Number(order.total)) {
    throw new HttpError(400, "Payment amount cannot exceed order total");
  }

  const paynow = requirePaynowClient();
  const reference = `NVO-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const [merchant, settings] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId } }),
    prisma.settings.findFirst({ where: { merchantId, deletedAt: null } })
  ]);
  const payerEmail =
    (identifier.includes("@") ? identifier : null) ??
    settings?.supportEmail ??
    merchant?.email ??
    `support+${merchantId.slice(0, 6)}@novoriq.app`;

  const payment = paynow.createPayment(reference, payerEmail);
  payment.add(`Order ${order.orderNumber}`, body.amount);

  let response: Record<string, unknown>;
  try {
    response =
      body.method === "ecocash" || body.method === "onemoney"
        ? (await paynow.sendMobile(payment, body.phone ?? "", body.method)) as Record<string, unknown>
        : (await paynow.send(payment)) as Record<string, unknown>;
  } catch (error) {
    throw new HttpError(400, extractProviderError(error));
  }

  const pollUrl = asString(response.pollUrl);
  const redirectUrl = asString(response.redirectUrl);
  const instructionText = asString(response.instructions);

  if (!response.success || !pollUrl) {
    throw new HttpError(400, `Paynow initiation failed: ${String(response.errors ?? "unknown error")}`);
  }

  const now = new Date();
  const transactionId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.paynowTransaction.create({
      data: {
        id: transactionId,
        merchantId,
        branchId: branchId ?? order.branchId ?? null,
        orderId: order.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        amount: body.amount,
        method: body.method,
        phone: body.phone ?? null,
        reference,
        pollUrl,
        redirectUrl: redirectUrl ?? null,
        status: "CREATED",
        rawInitResponse: toJsonValue(response),
        createdAt: now,
        updatedAt: now,
        lastModifiedByDeviceId: deviceId
      }
    });

    await tx.payment.create({
      data: {
        id: randomUUID(),
        merchantId,
        branchId: branchId ?? order.branchId ?? null,
        orderId: order.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        amount: body.amount,
        method: "PAYNOW",
        reference,
        paidAt: now,
        status: "PENDING",
        paynowTransactionId: transactionId,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: deviceId
      }
    });
  });

  return {
    transactionId,
    pollUrl,
    redirectUrl,
    instructions: instructionText ?? paymentInstructions(body.method)
  };
}

export async function pollPaynowStatus(
  prisma: PrismaClient,
  merchantId: string,
  payload: unknown
): Promise<{ status: PaynowNormalizedStatus; message: string; paynowRaw?: object }> {
  const body = paynowStatusSchema.parse(payload);

  const txn = await prisma.paynowTransaction.findFirst({
    where: { id: body.transactionId, merchantId, deletedAt: null }
  });

  if (!txn) {
    throw new HttpError(404, "Transaction not found");
  }

  const paynow = requirePaynowClient();
  const statusResponse = await paynow.pollTransaction(txn.pollUrl);
  const normalized = normalizeStatus(
    typeof statusResponse.status === "string" ? statusResponse.status : undefined,
    Boolean(statusResponse.paid)
  );

  await prisma.paynowTransaction.update({
    where: { id: txn.id },
    data: {
      status: normalized,
      rawLastStatus: toJsonValue(statusResponse),
      updatedAt: new Date(),
      updatedByUserId: txn.updatedByUserId ?? txn.createdByUserId ?? null,
      lastModifiedByDeviceId: txn.lastModifiedByDeviceId
    }
  });

  if (normalized === "PAID") {
    await applyPaidStatus(prisma, merchantId, txn.id, {
      deviceId: txn.lastModifiedByDeviceId,
      userId: txn.updatedByUserId ?? txn.createdByUserId ?? undefined
    });
  }

  return {
    status: normalized,
    message: statusMessage(normalized),
    paynowRaw: statusResponse as Record<string, unknown>
  };
}

export function verifyPaynowWebhookSignature(payload: Record<string, unknown>): boolean {
  if (!env.PAYNOW_INTEGRATION_KEY) return false;

  const provided = String(payload.hash ?? payload.Hash ?? "").toUpperCase();
  if (!provided) return false;

  const keys = Object.keys(payload)
    .filter((key) => key.toLowerCase() !== "hash")
    .sort((a, b) => a.localeCompare(b));

  const concatenated = keys.map((key) => String(payload[key] ?? "")).join("");
  const generated = createHash("sha512")
    .update(concatenated + env.PAYNOW_INTEGRATION_KEY)
    .digest("hex")
    .toUpperCase();

  return generated === provided;
}

export async function handlePaynowWebhook(prisma: PrismaClient, payload: Record<string, unknown>): Promise<void> {
  if (!verifyPaynowWebhookSignature(payload)) {
    throw new HttpError(401, "Invalid Paynow signature");
  }

  const reference = String(payload.reference ?? payload.Reference ?? "").trim();
  if (!reference) {
    throw new HttpError(400, "Missing Paynow reference");
  }

  const txn = await prisma.paynowTransaction.findFirst({ where: { reference, deletedAt: null } });

  if (!txn) {
    throw new HttpError(404, "Referenced transaction not found");
  }

  const rawStatus = String(payload.status ?? payload.Status ?? "");
  const normalized = normalizeStatus(rawStatus, String(payload.paid ?? "").toLowerCase() === "true");

  await prisma.paynowTransaction.update({
    where: { id: txn.id },
    data: {
      status: normalized,
      rawLastStatus: toJsonValue(payload),
      updatedAt: new Date(),
      updatedByUserId: txn.updatedByUserId ?? txn.createdByUserId ?? null,
      lastModifiedByDeviceId: txn.lastModifiedByDeviceId
    }
  });

  if (normalized === "PAID") {
    await applyPaidStatus(prisma, txn.merchantId, txn.id, {
      deviceId: "server-paynow-webhook",
      userId: txn.updatedByUserId ?? txn.createdByUserId ?? undefined
    });
  }
}
