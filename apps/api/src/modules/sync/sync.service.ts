import {
  customerSchema,
  featureFlagSchema,
  orderItemSchema,
  orderSchema,
  paymentSchema,
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

function dateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function isNewer(clientUpdatedAt: string, serverUpdatedAt: Date): boolean {
  return new Date(clientUpdatedAt).getTime() >= serverUpdatedAt.getTime();
}

function ensureMerchantScope(payloadMerchantId: string, merchantId: string): void {
  if (payloadMerchantId !== merchantId) {
    throw new HttpError(403, "Cross-tenant payload rejected");
  }
}

async function upsertEntity(
  tx: Prisma.TransactionClient,
  merchantId: string,
  operation: SyncOperation
): Promise<void> {
  switch (operation.entityType) {
    case "product": {
      const payload = productSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.product.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.product.update({
          where: { id: payload.id },
          data: {
            name: payload.name,
            price: payload.price,
            cost: payload.cost,
            sku: payload.sku,
            stockQty: payload.stockQty,
            lowStockThreshold: payload.lowStockThreshold,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.product.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            name: payload.name,
            price: payload.price,
            cost: payload.cost,
            sku: payload.sku,
            stockQty: payload.stockQty,
            lowStockThreshold: payload.lowStockThreshold,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "customer": {
      const payload = customerSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.customer.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.customer.update({
          where: { id: payload.id },
          data: {
            name: payload.name,
            phone: payload.phone,
            notes: payload.notes,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.customer.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            name: payload.name,
            phone: payload.phone,
            notes: payload.notes,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "order": {
      const payload = orderSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.order.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.order.update({
          where: { id: payload.id },
          data: {
            customerId: payload.customerId,
            orderNumber: payload.orderNumber,
            status: payload.status,
            subtotal: payload.subtotal,
            discountAmount: payload.discountAmount,
            discountPercent: payload.discountPercent,
            total: payload.total,
            notes: payload.notes,
            confirmedAt: dateValue(payload.confirmedAt),
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.order.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            customerId: payload.customerId,
            orderNumber: payload.orderNumber,
            status: payload.status,
            subtotal: payload.subtotal,
            discountAmount: payload.discountAmount,
            discountPercent: payload.discountPercent,
            total: payload.total,
            notes: payload.notes,
            confirmedAt: dateValue(payload.confirmedAt),
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "orderItem": {
      const payload = orderItemSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.orderItem.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.orderItem.update({
          where: { id: payload.id },
          data: {
            orderId: payload.orderId,
            productId: payload.productId,
            quantity: payload.quantity,
            unitPrice: payload.unitPrice,
            lineTotal: payload.lineTotal,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.orderItem.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            orderId: payload.orderId,
            productId: payload.productId,
            quantity: payload.quantity,
            unitPrice: payload.unitPrice,
            lineTotal: payload.lineTotal,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "payment": {
      const payload = paymentSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.payment.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.payment.update({
          where: { id: payload.id },
          data: {
            orderId: payload.orderId,
            amount: payload.amount,
            method: payload.method as Prisma.PaymentUpdateInput["method"],
            reference: payload.reference,
            paidAt: new Date(payload.paidAt),
            status: payload.status as Prisma.PaymentUpdateInput["status"],
            paynowTransactionId: payload.paynowTransactionId,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.payment.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            orderId: payload.orderId,
            amount: payload.amount,
            method: payload.method as Prisma.PaymentCreateInput["method"],
            reference: payload.reference,
            paidAt: new Date(payload.paidAt),
            status: payload.status as Prisma.PaymentCreateInput["status"],
            paynowTransactionId: payload.paynowTransactionId,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "stockMovement": {
      const payload = stockMovementSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.stockMovement.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.stockMovement.update({
          where: { id: payload.id },
          data: {
            productId: payload.productId,
            type: payload.type,
            quantity: payload.quantity,
            reason: payload.reason,
            orderId: payload.orderId,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.stockMovement.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            productId: payload.productId,
            type: payload.type,
            quantity: payload.quantity,
            reason: payload.reason,
            orderId: payload.orderId,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "settings": {
      const payload = settingsSchema.parse(operation.payload);
      ensureMerchantScope(payload.merchantId, merchantId);

      const existing = await tx.settings.findFirst({ where: { id: payload.id, merchantId } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.settings.update({
          where: { id: payload.id },
          data: {
            businessName: payload.businessName,
            currencyCode: payload.currencyCode,
            currencySymbol: payload.currencySymbol,
            paymentInstructions: payload.paymentInstructions,
            whatsappTemplate: payload.whatsappTemplate,
            supportPhone: payload.supportPhone,
            supportEmail: payload.supportEmail,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      } else {
        await tx.settings.create({
          data: {
            id: payload.id,
            merchantId: payload.merchantId,
            businessName: payload.businessName,
            currencyCode: payload.currencyCode,
            currencySymbol: payload.currencySymbol,
            paymentInstructions: payload.paymentInstructions,
            whatsappTemplate: payload.whatsappTemplate,
            supportPhone: payload.supportPhone,
            supportEmail: payload.supportEmail,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
            deletedAt: dateValue(payload.deletedAt),
            version: payload.version,
            lastModifiedByDeviceId: payload.lastModifiedByDeviceId
          }
        });
      }

      return;
    }

    case "featureFlag": {
      const payload = featureFlagSchema.parse(operation.payload);
      if (payload.merchantId && payload.merchantId !== merchantId) {
        throw new HttpError(403, "Cross-tenant payload rejected");
      }

      const existing = await tx.featureFlag.findFirst({ where: { id: payload.id } });
      if (existing && !isNewer(payload.updatedAt, existing.updatedAt)) return;

      if (existing) {
        await tx.featureFlag.update({
          where: { id: payload.id },
          data: {
            key: payload.key,
            enabled: payload.enabled,
            merchantId: payload.merchantId,
            updatedAt: new Date(payload.updatedAt)
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
            updatedAt: new Date(payload.updatedAt)
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
  merchantId: string,
  operation: SyncOperation
): Promise<void> {
  const when = operation.clientUpdatedAt ? new Date(operation.clientUpdatedAt) : new Date();

  switch (operation.entityType) {
    case "product":
      await tx.product.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "customer":
      await tx.customer.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "order":
      await tx.order.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "orderItem":
      await tx.orderItem.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "payment":
      await tx.payment.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "stockMovement":
      await tx.stockMovement.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "settings":
      await tx.settings.updateMany({
        where: { id: operation.entityId, merchantId },
        data: { deletedAt: when, updatedAt: when, version: { increment: 1 } }
      });
      return;
    case "featureFlag":
      await tx.featureFlag.updateMany({
        where: { id: operation.entityId, OR: [{ merchantId }, { merchantId: null }] },
        data: { deletedAt: when, updatedAt: when }
      });
      return;
    default:
      throw new HttpError(400, "Unsupported entity type");
  }
}

export async function handleSyncPush(prisma: PrismaClient, merchantId: string, input: unknown): Promise<PushResult> {
  const parsed = syncPushSchema.parse(input);
  const acceptedOpIds: string[] = [];
  const rejected: Array<{ opId: string; reason: string }> = [];

  for (const operation of parsed.operations) {
    const existingLog = await prisma.syncOperationLog.findUnique({
      where: {
        merchantId_opId: {
          merchantId,
          opId: operation.opId
        }
      }
    });

    if (existingLog) {
      acceptedOpIds.push(operation.opId);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (operation.opType === "UPSERT") {
          await upsertEntity(tx, merchantId, operation);
        } else {
          await softDeleteEntity(tx, merchantId, operation);
        }

        await tx.syncOperationLog.create({
          data: {
            merchantId,
            opId: operation.opId,
            entityType: operation.entityType,
            opType: operation.opType,
            entityId: operation.entityId,
            payload: operation.payload,
            status: "ACCEPTED"
          }
        });
      });

      acceptedOpIds.push(operation.opId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown sync error";
      rejected.push({ opId: operation.opId, reason });

      await prisma.syncOperationLog.create({
        data: {
          merchantId,
          opId: operation.opId,
          entityType: operation.entityType,
          opType: operation.opType,
          entityId: operation.entityId,
          payload: { reason, payload: operation.payload },
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
  merchantId: string,
  since?: string
): Promise<Record<string, unknown>> {
  const sinceDate = since ? new Date(since) : undefined;
  const updatedFilter = sinceDate ? { updatedAt: { gt: sinceDate } } : {};

  const [products, customers, orders, orderItems, payments, stockMovements, settings, featureFlags] =
    await Promise.all([
      prisma.product.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.customer.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.order.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.orderItem.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.payment.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.stockMovement.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.settings.findMany({ where: { merchantId, ...updatedFilter } }),
      prisma.featureFlag.findMany({
        where: {
          OR: [{ merchantId }, { merchantId: null }],
          ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {})
        }
      })
    ]);

  return toPlain({
    serverTime: new Date().toISOString(),
    changes: {
      products,
      customers,
      orders,
      orderItems,
      payments,
      stockMovements,
      settings,
      featureFlags
    }
  });
}
