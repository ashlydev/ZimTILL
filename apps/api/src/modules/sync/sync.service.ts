import {
  categorySchema,
  customerSchema,
  featureFlagSchema,
  orderItemSchema,
  orderSchema,
  paymentSchema,
  paynowTransactionSchema,
  productSchema,
  settingsSchema,
  stockMovementSchema,
  SyncOperation,
  syncPushSchema
} from "@novoriq/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../../lib/http";
import { toPlain } from "../../lib/serialization";

type PushResult = {
  acceptedOpIds: string[];
  rejected: Array<{ opId: string; reason: string }>;
  serverTime: string;
};

type SyncActorContext = {
  merchantId: string;
  userId: string;
  deviceId: string;
};

const upsertPriority: Partial<Record<SyncOperation["entityType"], number>> = {
  settings: 0,
  category: 1,
  product: 2,
  customer: 3,
  order: 4,
  orderItem: 5,
  payment: 6,
  paynowTransaction: 7,
  stockMovement: 8,
  featureFlag: 9
};

function dateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function jsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clientUpdatedAt(operation: SyncOperation): Date {
  return new Date(operation.clientUpdatedAt);
}

function isClientNewer(operation: SyncOperation, serverUpdatedAt: Date): boolean {
  return clientUpdatedAt(operation).getTime() > serverUpdatedAt.getTime();
}

function ensureMerchantScope(payloadMerchantId: string, merchantId: string): void {
  if (payloadMerchantId !== merchantId) {
    throw new HttpError(403, "Cross-tenant payload rejected");
  }
}

function ensureOperationActor(operation: SyncOperation, actor: SyncActorContext): void {
  if (operation.userId !== actor.userId || operation.deviceId !== actor.deviceId) {
    throw new HttpError(403, "Sync actor mismatch");
  }
}

async function assertSyncActorAllowed(prisma: PrismaClient, actor: SyncActorContext): Promise<void> {
  const [user, device] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: actor.userId,
        merchantId: actor.merchantId,
        deletedAt: null,
        isActive: true
      }
    }),
    prisma.device.findFirst({
      where: {
        merchantId: actor.merchantId,
        userId: actor.userId,
        deviceId: actor.deviceId,
        deletedAt: null,
        revokedAt: null
      }
    })
  ]);

  if (!user) {
    throw new HttpError(401, "User is disabled or missing");
  }

  if (!device) {
    throw new HttpError(401, "Device is revoked or missing");
  }
}

function baseAuditData(existingCreatedByUserId: string | null | undefined, actor: SyncActorContext, operation: SyncOperation) {
  return {
    createdByUserId: existingCreatedByUserId ?? actor.userId,
    updatedByUserId: actor.userId,
    updatedAt: clientUpdatedAt(operation),
    lastModifiedByDeviceId: actor.deviceId
  };
}

function sortSyncOperations(operations: SyncOperation[]): SyncOperation[] {
  return [...operations].sort((left, right) => {
    const leftPriority = left.opType === "UPSERT" ? upsertPriority[left.entityType] ?? 100 : 1_000;
    const rightPriority = right.opType === "UPSERT" ? upsertPriority[right.entityType] ?? 100 : 1_000;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(left.clientUpdatedAt).getTime() - new Date(right.clientUpdatedAt).getTime();
  });
}

async function assertOrderItemRelations(
  tx: Prisma.TransactionClient,
  actor: SyncActorContext,
  payload: ReturnType<typeof orderItemSchema.parse>
): Promise<void> {
  const [order, product] = await Promise.all([
    tx.order.findFirst({
      where: {
        id: payload.orderId,
        merchantId: actor.merchantId
      }
    }),
    tx.product.findFirst({
      where: {
        id: payload.productId,
        merchantId: actor.merchantId
      }
    })
  ]);

  if (!order) {
    throw new HttpError(409, "Order item is waiting for its order to sync first.", "ORDER_NOT_READY");
  }

  if (!product) {
    throw new HttpError(409, "Order item is waiting for its product to sync first.", "PRODUCT_NOT_READY");
  }
}

function getSyncRejectionReason(error: unknown, operation: SyncOperation): string {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    if (operation.entityType === "orderItem") {
      return "Order item is waiting for its order to sync first.";
    }

    if (operation.entityType === "payment") {
      return "Payment is waiting for its order to sync first.";
    }

    return "A related record is missing. Sync will retry when its parent record is available.";
  }

  return error instanceof Error ? error.message : "Unknown sync error";
}

async function upsertEntity(
  tx: Prisma.TransactionClient,
  actor: SyncActorContext,
  operation: SyncOperation
): Promise<void> {
  switch (operation.entityType) {
    case "product": {
      const payload = productSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.product.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        name: payload.name,
        price: payload.price,
        cost: payload.cost,
        sku: payload.sku,
        categoryId: payload.categoryId ?? null,
        category: payload.category,
        stockQty: payload.stockQty,
        lowStockThreshold: payload.lowStockThreshold,
        isPublished: payload.isPublished,
        isActive: payload.isActive,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.product.update({ where: { id: payload.id }, data });
      } else {
        await tx.product.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "category": {
      const payload = categorySchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.category.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        name: payload.name,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.category.update({ where: { id: payload.id }, data });
      } else {
        await tx.category.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "customer": {
      const payload = customerSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.customer.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        name: payload.name,
        phone: payload.phone,
        notes: payload.notes,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.customer.update({ where: { id: payload.id }, data });
      } else {
        await tx.customer.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "order": {
      const payload = orderSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.order.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        branchId: payload.branchId ?? null,
        customerId: payload.customerId,
        orderNumber: payload.orderNumber,
        status: payload.status,
        documentType: payload.documentType,
        source: payload.source,
        subtotal: payload.subtotal,
        discountAmount: payload.discountAmount,
        discountPercent: payload.discountPercent,
        total: payload.total,
        notes: payload.notes,
        customerName: payload.customerName ?? null,
        customerPhone: payload.customerPhone ?? null,
        confirmedAt: dateValue(payload.confirmedAt),
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.order.update({ where: { id: payload.id }, data });
      } else {
        await tx.order.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "orderItem": {
      const payload = orderItemSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);
      await assertOrderItemRelations(tx, actor, payload);

      const existing = await tx.orderItem.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        orderId: payload.orderId,
        productId: payload.productId,
        quantity: payload.quantity,
        unitPrice: payload.unitPrice,
        lineTotal: payload.lineTotal,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.orderItem.update({ where: { id: payload.id }, data });
      } else {
        await tx.orderItem.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "payment": {
      const payload = paymentSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.payment.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        branchId: payload.branchId ?? null,
        orderId: payload.orderId,
        amount: payload.amount,
        method: payload.method as Prisma.PaymentCreateInput["method"],
        reference: payload.reference,
        paidAt: new Date(payload.paidAt),
        status: payload.status as Prisma.PaymentCreateInput["status"],
        paynowTransactionId: payload.paynowTransactionId,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.payment.update({ where: { id: payload.id }, data });
      } else {
        await tx.payment.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "paynowTransaction": {
      const payload = paynowTransactionSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.paynowTransaction.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        branchId: payload.branchId ?? null,
        orderId: payload.orderId,
        amount: payload.amount,
        method: payload.method,
        phone: payload.phone ?? null,
        reference: payload.reference,
        pollUrl: payload.pollUrl,
        redirectUrl: payload.redirectUrl ?? null,
        status: payload.status,
        rawInitResponse: jsonValue(payload.rawInitResponse ?? null),
        rawLastStatus: jsonValue(payload.rawLastStatus ?? null),
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.paynowTransaction.update({ where: { id: payload.id }, data });
      } else {
        await tx.paynowTransaction.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "stockMovement": {
      const payload = stockMovementSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.stockMovement.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        branchId: payload.branchId ?? null,
        productId: payload.productId,
        type: payload.type,
        quantity: payload.quantity,
        reason: payload.reason,
        orderId: payload.orderId,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.stockMovement.update({ where: { id: payload.id }, data });
      } else {
        await tx.stockMovement.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "settings": {
      const payload = settingsSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, actor.merchantId);

      const existing = await tx.settings.findFirst({ where: { id: payload.id, merchantId: actor.merchantId } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      const data = {
        businessName: payload.businessName,
        currencyCode: payload.currencyCode,
        currencySymbol: payload.currencySymbol,
        paymentInstructions: payload.paymentInstructions,
        whatsappTemplate: payload.whatsappTemplate,
        supportPhone: payload.supportPhone,
        supportEmail: payload.supportEmail,
        createdAt: new Date(payload.createdAt),
        deletedAt: dateValue(payload.deletedAt),
        version: payload.version,
        ...baseAuditData(existing?.createdByUserId, actor, operation)
      };

      if (existing) {
        await tx.settings.update({ where: { id: payload.id }, data });
      } else {
        await tx.settings.create({
          data: {
            id: payload.id,
            merchantId: actor.merchantId,
            ...data
          }
        });
      }

      return;
    }

    case "featureFlag": {
      const payload = featureFlagSchema.parse(operation.payload);
      if (payload.merchantId && payload.merchantId !== actor.merchantId) {
        throw new HttpError(403, "Cross-tenant payload rejected");
      }

      const existing = await tx.featureFlag.findFirst({ where: { id: payload.id } });
      if (existing && !isClientNewer(operation, existing.updatedAt)) return;

      if (existing) {
        await tx.featureFlag.update({
          where: { id: payload.id },
          data: {
            key: payload.key,
            enabled: payload.enabled,
            merchantId: payload.merchantId,
            updatedAt: clientUpdatedAt(operation)
          }
        });
      } else {
        await tx.featureFlag.create({
          data: {
            id: payload.id,
            key: payload.key,
            enabled: payload.enabled,
            merchantId: payload.merchantId,
            createdAt: new Date(payload.createdAt),
            updatedAt: clientUpdatedAt(operation)
          }
        });
      }

      return;
    }

    default:
      throw new HttpError(400, "Unsupported entity type");
  }
}

async function softDeleteEntity(
  tx: Prisma.TransactionClient,
  actor: SyncActorContext,
  operation: SyncOperation
): Promise<void> {
  const when = clientUpdatedAt(operation);
  const baseDelete = {
    deletedAt: when,
    updatedAt: when,
    updatedByUserId: actor.userId,
    lastModifiedByDeviceId: actor.deviceId,
    version: { increment: 1 as const }
  };

  switch (operation.entityType) {
    case "category":
      await tx.category.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "product":
      await tx.product.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "customer":
      await tx.customer.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "order":
      await tx.order.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "orderItem":
      await tx.orderItem.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "payment":
      await tx.payment.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "paynowTransaction":
      await tx.paynowTransaction.updateMany({
        where: { id: operation.entityId, merchantId: actor.merchantId },
        data: {
          deletedAt: when,
          updatedAt: when,
          updatedByUserId: actor.userId,
          lastModifiedByDeviceId: actor.deviceId
        }
      });
      return;
    case "stockMovement":
      await tx.stockMovement.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "settings":
      await tx.settings.updateMany({ where: { id: operation.entityId, merchantId: actor.merchantId }, data: baseDelete });
      return;
    case "featureFlag":
      await tx.featureFlag.updateMany({
        where: { id: operation.entityId, OR: [{ merchantId: actor.merchantId }, { merchantId: null }] },
        data: { deletedAt: when, updatedAt: when }
      });
      return;
    default:
      throw new HttpError(400, "Unsupported entity type");
  }
}

export async function handleSyncPush(
  prisma: PrismaClient,
  actor: SyncActorContext,
  input: unknown
): Promise<PushResult> {
  await assertSyncActorAllowed(prisma, actor);

  const parsed = syncPushSchema.parse(input);
  const acceptedOpIds: string[] = [];
  const rejected: Array<{ opId: string; reason: string }> = [];

  for (const operation of sortSyncOperations(parsed.operations)) {
    const existingLog = await prisma.syncOperationLog.findUnique({
      where: {
        merchantId_opId: {
          merchantId: actor.merchantId,
          opId: operation.opId
        }
      }
    });

    if (existingLog) {
      acceptedOpIds.push(operation.opId);
      continue;
    }

    try {
      ensureOperationActor(operation, actor);

      await prisma.$transaction(async (tx) => {
        if (operation.opType === "UPSERT") {
          await upsertEntity(tx, actor, operation);
        } else {
          await softDeleteEntity(tx, actor, operation);
        }

        await tx.syncOperationLog.create({
          data: {
            merchantId: actor.merchantId,
            opId: operation.opId,
            entityType: operation.entityType,
            opType: operation.opType,
            entityId: operation.entityId,
            payload: jsonValue(operation.payload)!,
            status: "ACCEPTED"
          }
        });
      });

      acceptedOpIds.push(operation.opId);
    } catch (error) {
      const reason = getSyncRejectionReason(error, operation);
      rejected.push({ opId: operation.opId, reason });

      await prisma.syncOperationLog.create({
        data: {
          merchantId: actor.merchantId,
          opId: operation.opId,
          entityType: operation.entityType,
          opType: operation.opType,
          entityId: operation.entityId,
          payload: jsonValue({ reason, payload: operation.payload })!,
          status: "REJECTED"
        }
      });
    }
  }

  return {
    acceptedOpIds,
    rejected,
    serverTime: new Date().toISOString()
  };
}

export async function handleSyncPull(
  prisma: PrismaClient,
  actor: SyncActorContext,
  since?: string
): Promise<Record<string, unknown>> {
  await assertSyncActorAllowed(prisma, actor);

  const sinceDate = since ? new Date(since) : undefined;
  const updatedFilter = sinceDate ? { updatedAt: { gt: sinceDate } } : {};

  const [categories, products, customers, orders, orderItems, payments, paynowTransactions, stockMovements, settings, featureFlags] =
    await Promise.all([
      prisma.category.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.product.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.customer.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.order.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.orderItem.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.payment.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.paynowTransaction.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.stockMovement.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.settings.findMany({ where: { merchantId: actor.merchantId, ...updatedFilter } }),
      prisma.featureFlag.findMany({
        where: {
          OR: [{ merchantId: actor.merchantId }, { merchantId: null }],
          ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {})
        }
      })
    ]);

  return toPlain({
    serverTime: new Date().toISOString(),
    changes: {
      branches: [],
      categories,
      products,
      productStocks: [],
      customers,
      orders,
      orderItems,
      payments,
      paynowTransactions,
      stockMovements,
      transfers: [],
      transferItems: [],
      deliveries: [],
      settings,
      catalogSettings: [],
      featureFlags
    }
  });
}
