import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { hasPermission, requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { formatCurrency, updateOrderPaymentStatus } from "./order-utils";
import { recordAudit } from "../audit/audit.service";
import { createNotification } from "../notifications/notifications.service";

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const createOrderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).min(1),
  discountAmount: z.number().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().trim().max(500).optional()
});

const updateOrderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  status: z.enum(["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(),
  discountAmount: z.number().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().trim().max(500).nullable().optional()
});

const cancelOrderSchema = z.object({
  reason: z.string().trim().max(240).optional()
});

function productNotFoundError(): HttpError {
  return new HttpError(404, "This product is no longer available. Remove it and try again.", "PRODUCT_NOT_FOUND");
}

function insufficientStockError(productName: string, available: number): HttpError {
  return new HttpError(409, `Insufficient stock for ${productName}. Only ${available} left.`, "INSUFFICIENT_STOCK");
}

async function loadProductsForItems(
  merchantId: string,
  items: Array<{ productId: string; quantity: number }>
) {
  const uniqueIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: {
      id: { in: uniqueIds },
      merchantId,
      deletedAt: null
    }
  });

  if (products.length !== uniqueIds.length) {
    throw productNotFoundError();
  }

  return new Map(products.map((item) => [item.id, item]));
}

function calculateOrderTotals(
  items: Array<{ productId: string; quantity: number }>,
  productById: Map<string, { price: unknown }>,
  discountAmount?: number,
  discountPercent?: number
) {
  const subtotal = items.reduce((sum, item) => {
    const product = productById.get(item.productId);
    if (!product) {
      throw productNotFoundError();
    }
    return sum + Number(product.price) * item.quantity;
  }, 0);

  const resolvedDiscountPercent = Number(discountPercent ?? 0);
  const explicitDiscountAmount = Number(discountAmount ?? 0);
  const resolvedDiscountAmount =
    explicitDiscountAmount > 0 ? explicitDiscountAmount : subtotal * (resolvedDiscountPercent / 100);

  return {
    subtotal,
    discountPercent: resolvedDiscountPercent,
    discountAmount: resolvedDiscountAmount,
    total: Math.max(subtotal - resolvedDiscountAmount, 0)
  };
}

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  "/",
  requirePermission("orders.read"),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : req.user!.branchId ?? undefined;
    const orders = await prisma.order.findMany({
      where: {
        merchantId: req.user!.merchantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: "insensitive" } },
                { customer: { name: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { customer: true },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ orders: toPlain(orders) });
  })
);

ordersRouter.post(
  "/",
  requirePermission("orders.write"),
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    const deviceId = req.user!.deviceId;
    const branchId = req.user!.branchId ?? null;
    const body = req.body as z.infer<typeof createOrderSchema>;
    const items = body.items as Array<{ productId: string; quantity: number }>;
    const now = new Date();
    const byId = await loadProductsForItems(merchantId, items);
    const customer = body.customerId
      ? await prisma.customer.findFirst({ where: { id: body.customerId, merchantId, deletedAt: null } })
      : null;
    const requestedDiscountAmount = Number(body.discountAmount ?? 0);
    const requestedDiscountPercent = Number(body.discountPercent ?? 0);
    if ((requestedDiscountAmount > 0 || requestedDiscountPercent > 0) && !hasPermission(req.user!.role, "discounts.override")) {
      throw new HttpError(403, "A manager approval is required before applying discounts.", "DISCOUNT_OVERRIDE_REQUIRED");
    }
    const { subtotal, discountAmount, discountPercent, total } = calculateOrderTotals(items, byId, body.discountAmount, body.discountPercent);

    const orderId = randomUUID();
    const orderNumber = `NVO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(
      100000 + Math.random() * 899999
    )}`;

    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          id: orderId,
          merchantId,
          branchId,
          customerId: body.customerId ?? null,
          createdByUserId: req.user!.userId,
          updatedByUserId: req.user!.userId,
          orderNumber,
          status: "DRAFT",
          documentType: "ORDER",
          source: "IN_STORE",
          subtotal,
          discountAmount,
          discountPercent,
          total,
          notes: body.notes ?? null,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          confirmedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: deviceId
        }
      });

      await tx.orderItem.createMany({
        data: items.map((item) => {
          const product = byId.get(item.productId);
          if (!product) {
            throw productNotFoundError();
          }
          const lineTotal = Number(product.price) * item.quantity;
          return {
            id: randomUUID(),
            merchantId,
            orderId,
            productId: product.id,
            createdByUserId: req.user!.userId,
            updatedByUserId: req.user!.userId,
            quantity: item.quantity,
            unitPrice: Number(product.price),
            lineTotal,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: deviceId
          };
        })
      });

      return order;
    });

    await recordAudit(prisma, req.user!, {
      action: "order.create",
      entityType: "Order",
      entityId: created.id,
      metadata: {
        status: created.status,
        total: Number(created.total)
      }
    });

    res.status(201).json({ order: toPlain(created) });
  })
);

ordersRouter.get(
  "/:id",
  requirePermission("orders.read"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const order = await prisma.order.findFirst({
      where: { id, merchantId: req.user!.merchantId, deletedAt: null },
      include: {
        customer: true,
        items: { include: { product: true }, where: { deletedAt: null } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" } },
        delivery: true
      }
    });

    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    const paid = order.payments
      .filter((payment) => payment.status === "CONFIRMED")
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    res.json({
      order: toPlain(order),
      summary: {
        paid,
        balance: Number(order.total) - paid
      }
    });
  })
);

ordersRouter.put(
  "/:id",
  requirePermission("orders.manage"),
  validateBody(updateOrderSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const existing = await prisma.order.findFirst({ where: { id, merchantId, deletedAt: null } });

    if (!existing) {
      throw new HttpError(404, "Order not found");
    }

    const body = req.body as z.infer<typeof updateOrderSchema>;
    if (body.status && ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(body.status)) {
      throw new HttpError(400, "Use the confirm or payment actions to move an order into a paid state.", "ORDER_STATUS_FLOW");
    }

    const updated = await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...body,
        updatedAt: new Date(),
        updatedByUserId: req.user!.userId,
        version: { increment: 1 },
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "order.update",
      entityType: "Order",
      entityId: updated.id,
      metadata: { status: updated.status }
    });

    res.json({ order: toPlain(updated) });
  })
);

ordersRouter.post(
  "/:id/confirm",
  requirePermission("orders.manage"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const order = await prisma.order.findFirst({
      where: { id, merchantId, deletedAt: null },
      include: { items: { where: { deletedAt: null } } }
    });

    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    if (order.status === "CONFIRMED" || order.status === "PAID" || order.status === "PARTIALLY_PAID") {
      res.json({ order: toPlain(order) });
      return;
    }

    const now = new Date();
    const productIds = [...new Set(order.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, merchantId, deletedAt: null }
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    if (productById.size !== productIds.length) {
      throw productNotFoundError();
    }

    if (order.branchId) {
      const branchStocks = await prisma.productStock.findMany({
        where: {
          merchantId,
          branchId: order.branchId,
          productId: { in: productIds },
          deletedAt: null
        }
      });
      const branchStockByProductId = new Map(branchStocks.map((stock) => [stock.productId, stock]));

      for (const item of order.items) {
        const product = productById.get(item.productId);
        if (!product) {
          throw productNotFoundError();
        }

        const branchStock = branchStockByProductId.get(item.productId);
        const available = Number(branchStock?.qty ?? product.stockQty);
        const required = Number(item.quantity);
        if (available < required) {
          throw insufficientStockError(product.name, available);
        }
      }
    } else {
      for (const item of order.items) {
        const product = productById.get(item.productId);
        if (!product) {
          throw productNotFoundError();
        }

        const available = Number(product.stockQty);
        const required = Number(item.quantity);
        if (available < required) {
          throw insufficientStockError(product.name, available);
        }
      }
    }

    const confirmed = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: now,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      for (const item of order.items) {
        const product = productById.get(item.productId);
        if (!product) {
          throw productNotFoundError();
        }

        if (order.branchId) {
          const branchStock = await tx.productStock.findFirst({
            where: { merchantId, branchId: order.branchId, productId: product.id, deletedAt: null }
          });

          if (branchStock) {
            await tx.productStock.update({
              where: { id: branchStock.id },
              data: {
                qty: Number(branchStock.qty) - Number(item.quantity),
                updatedAt: now,
                version: { increment: 1 },
                lastModifiedByDeviceId: req.user!.deviceId
              }
            });
          }
        }

        await tx.product.update({
          where: { id: product.id },
          data: {
            stockQty: Number(product.stockQty) - Number(item.quantity),
            updatedAt: now,
            updatedByUserId: req.user!.userId,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            merchantId,
            branchId: order.branchId ?? null,
            productId: product.id,
            createdByUserId: req.user!.userId,
            updatedByUserId: req.user!.userId,
            type: "OUT",
            quantity: -Number(item.quantity),
            reason: `Order confirmed ${order.orderNumber}`,
            orderId: order.id,
            createdAt: now,
            updatedAt: now,
            version: 1,
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });
      }

      return next;
    });

    await recordAudit(prisma, req.user!, {
      action: "order.confirm",
      entityType: "Order",
      entityId: confirmed.id,
      metadata: { status: confirmed.status }
    });

    await createNotification(prisma, {
      merchantId,
      branchId: confirmed.branchId ?? null,
      type: "SALE_COMPLETED",
      title: "Sale confirmed",
      message: `${confirmed.orderNumber} confirmed for ${formatCurrency("$", Number(confirmed.total))}.`,
      entityType: "Order",
      entityId: confirmed.id,
      severity: "success",
      visibility: "MANAGEMENT"
    });

    res.json({ order: toPlain(confirmed) });
  })
);

ordersRouter.post(
  "/:id/cancel",
  requirePermission("sales.void"),
  validateBody(cancelOrderSchema),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;
    const order = await prisma.order.findFirst({
      where: { id, merchantId, deletedAt: null },
      include: { items: { where: { deletedAt: null } } }
    });

    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    if (order.status === "CANCELLED") {
      res.json({ order: toPlain(order) });
      return;
    }

    const wasConfirmed = ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(order.status);
    const now = new Date();
    const reason = ((req.body as z.infer<typeof cancelOrderSchema> | undefined)?.reason ?? "").trim();

    const cancelled = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          notes: reason ? `${order.notes ?? ""}\nVoid reason: ${reason}`.trim() : order.notes,
          updatedAt: now,
          updatedByUserId: req.user!.userId,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      if (wasConfirmed) {
        for (const item of order.items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, merchantId, deletedAt: null }
          });

          if (!product) continue;

          if (order.branchId) {
            const branchStock = await tx.productStock.findFirst({
              where: { merchantId, branchId: order.branchId, productId: product.id, deletedAt: null }
            });

            if (branchStock) {
              await tx.productStock.update({
                where: { id: branchStock.id },
              data: {
                qty: Number(branchStock.qty) + Number(item.quantity),
                updatedAt: now,
                version: { increment: 1 },
                lastModifiedByDeviceId: req.user!.deviceId
              }
            });
            }
          }

          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQty: Number(product.stockQty) + Number(item.quantity),
              updatedAt: now,
              updatedByUserId: req.user!.userId,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });

          await tx.stockMovement.create({
            data: {
              id: randomUUID(),
              merchantId,
              branchId: order.branchId ?? null,
              productId: product.id,
              createdByUserId: req.user!.userId,
              updatedByUserId: req.user!.userId,
              type: "IN",
              quantity: Number(item.quantity),
              reason: `Order cancelled ${order.orderNumber}`,
              orderId: order.id,
              createdAt: now,
              updatedAt: now,
              version: 1,
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });
        }
      }

      return next;
    });

    await recordAudit(prisma, req.user!, {
      action: "order.cancel",
      entityType: "Order",
      entityId: cancelled.id,
      metadata: { status: cancelled.status, reason: reason || null }
    });

    await createNotification(prisma, {
      merchantId,
      branchId: cancelled.branchId ?? null,
      type: "SUSPICIOUS_ACTIVITY",
      title: "Sale voided",
      message: `${cancelled.orderNumber} was voided${reason ? `: ${reason}` : ""}.`,
      entityType: "Order",
      entityId: cancelled.id,
      severity: "warning",
      visibility: "MANAGEMENT"
    });

    res.json({ order: toPlain(cancelled) });
  })
);

ordersRouter.post(
  "/:id/recalculate-status",
  requirePermission("orders.manage"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    await updateOrderPaymentStatus(prisma, id, req.user!.merchantId);
    const order = await prisma.order.findFirst({
      where: { id, merchantId: req.user!.merchantId }
    });
    res.json({ order: toPlain(order) });
  })
);

ordersRouter.get(
  "/:id/share-text",
  requirePermission("orders.read"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;

    const [order, settings] = await Promise.all([
      prisma.order.findFirst({
        where: { id, merchantId, deletedAt: null },
        include: {
          items: {
            where: { deletedAt: null },
            include: { product: true }
          },
          payments: { where: { deletedAt: null, status: "CONFIRMED" } }
        }
      }),
      prisma.settings.findFirst({ where: { merchantId, deletedAt: null } })
    ]);

    if (!order || !settings) {
      throw new HttpError(404, "Order or settings not found");
    }

    const paid = order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = Number(order.total) - paid;
    const itemLines = order.items
      .map((item) => {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice);
        const total = Number(item.lineTotal);
        return `${qty}x ${item.product.name} @ ${formatCurrency(settings.currencySymbol, price)} = ${formatCurrency(
          settings.currencySymbol,
          total
        )}`;
      })
      .join("\\n");

    const message = settings.whatsappTemplate
      .replace("{businessName}", settings.businessName)
      .replace("{orderNumber}", order.orderNumber)
      .replace("{items}", itemLines)
      .replace("{total}", formatCurrency(settings.currencySymbol, Number(order.total)))
      .replace("{balance}", formatCurrency(settings.currencySymbol, balance))
      .replace("{paymentInstructions}", settings.paymentInstructions);

    res.json({ message });
  })
);

ordersRouter.get(
  "/:id/receipt",
  requirePermission("orders.read"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const merchantId = req.user!.merchantId;

    const [merchant, settings, order] = await Promise.all([
      prisma.merchant.findUnique({ where: { id: merchantId } }),
      prisma.settings.findFirst({ where: { merchantId, deletedAt: null } }),
      prisma.order.findFirst({
        where: { id, merchantId, deletedAt: null },
        include: {
          customer: true,
          items: {
            where: { deletedAt: null },
            include: { product: true }
          },
          payments: {
            where: { deletedAt: null },
            orderBy: { paidAt: "asc" }
          },
          paynowTransactions: {
            where: { deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 1
          }
        }
      })
    ]);

    if (!order || !settings || !merchant) {
      throw new HttpError(404, "Order, merchant, or settings not found");
    }

    const paid = order.payments
      .filter((payment) => payment.status === "CONFIRMED")
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = Number(order.total) - paid;
    const receiptNumber = `RCPT-${order.orderNumber}`;

    res.json({
      receipt: toPlain({
        orderId: order.id,
        orderNumber: order.orderNumber,
        receiptNumber,
        dateTime: order.updatedAt,
        businessName: settings.businessName || merchant.name,
        logoPlaceholder: "NOVORIQ",
        customerName: order.customer?.name ?? "Walk-in",
        items: order.items.map((item) => ({
          id: item.id,
          name: item.product.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal)
        })),
        totals: {
          subtotal: Number(order.subtotal),
          discountAmount: Number(order.discountAmount),
          discountPercent: Number(order.discountPercent),
          total: Number(order.total),
          paid,
          balance
        },
        payments: order.payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          reference: payment.reference,
          status: payment.status,
          paidAt: payment.paidAt
        })),
        paynowStatus: order.paynowTransactions[0]?.status ?? null,
        qrPayload: order.id,
        currencySymbol: settings.currencySymbol
      })
    });
  })
);
