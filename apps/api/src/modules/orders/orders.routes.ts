import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { formatCurrency, updateOrderPaymentStatus } from "./order-utils";
import { recordAudit } from "../audit/audit.service";

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

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  "/",
  requirePermission("orders.read"),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const orders = await prisma.order.findMany({
      where: {
        merchantId: req.user!.merchantId,
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
    const body = req.body as z.infer<typeof createOrderSchema>;
    const now = new Date();

    const products = await prisma.product.findMany({
      where: {
        id: { in: body.items.map((item) => item.productId) },
        merchantId,
        deletedAt: null
      }
    });

    if (products.length !== body.items.length) {
      throw new HttpError(400, "One or more selected products are unavailable");
    }

    const byId = new Map(products.map((item) => [item.id, item]));
    const subtotal = body.items.reduce((sum, item) => {
      const product = byId.get(item.productId)!;
      return sum + Number(product.price) * item.quantity;
    }, 0);

    const discountPercent = body.discountPercent ?? 0;
    const discountAmount = body.discountAmount ?? subtotal * (discountPercent / 100);
    const total = Math.max(subtotal - discountAmount, 0);

    const orderId = randomUUID();
    const orderNumber = `NVO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(
      100000 + Math.random() * 899999
    )}`;

    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          id: orderId,
          merchantId,
          customerId: body.customerId ?? null,
          orderNumber,
          status: "DRAFT",
          subtotal,
          discountAmount,
          discountPercent,
          total,
          notes: body.notes ?? null,
          confirmedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: deviceId
        }
      });

      await tx.orderItem.createMany({
        data: body.items.map((item) => {
          const product = byId.get(item.productId)!;
          const lineTotal = Number(product.price) * item.quantity;
          return {
            id: randomUUID(),
            merchantId,
            orderId,
            productId: product.id,
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
        payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" } }
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

    const updated = await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...body,
        updatedAt: new Date(),
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

    const confirmed = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: now,
          updatedAt: now,
          version: { increment: 1 },
          lastModifiedByDeviceId: req.user!.deviceId
        }
      });

      for (const item of order.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, merchantId, deletedAt: null }
        });
        if (!product) continue;

        await tx.product.update({
          where: { id: product.id },
          data: {
            stockQty: Number(product.stockQty) - Number(item.quantity),
            updatedAt: now,
            version: { increment: 1 },
            lastModifiedByDeviceId: req.user!.deviceId
          }
        });

        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            merchantId,
            productId: product.id,
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

    res.json({ order: toPlain(confirmed) });
  })
);

ordersRouter.post(
  "/:id/cancel",
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

    if (order.status === "CANCELLED") {
      res.json({ order: toPlain(order) });
      return;
    }

    const wasConfirmed = ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(order.status);
    const now = new Date();

    const cancelled = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          updatedAt: now,
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

          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQty: Number(product.stockQty) + Number(item.quantity),
              updatedAt: now,
              version: { increment: 1 },
              lastModifiedByDeviceId: req.user!.deviceId
            }
          });

          await tx.stockMovement.create({
            data: {
              id: randomUUID(),
              merchantId,
              productId: product.id,
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
      metadata: { status: cancelled.status }
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
