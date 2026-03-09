import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../../lib/http";
import { toPlain } from "../../lib/serialization";
import { recordAudit } from "../audit/audit.service";
import { incrementUsageCounter } from "../platform/platform.service";
import { initiatePaynow } from "../payments/paynow.service";

export const updateCatalogSettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  merchantSlug: z.string().trim().min(2).max(80).optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  checkoutPolicy: z.enum(["CONFIRM_ON_PAID", "CONFIRM_ON_CREATE"]).optional()
});

export const publicCheckoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(7).max(30),
  notes: z.string().trim().max(300).optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).min(1),
  paymentMode: z.enum(["ECOCASH", "PAY_LATER"]).default("ECOCASH")
});

export async function getPublicCatalog(prisma: PrismaClient, merchantSlug: string) {
  const settings = await prisma.catalogSettings.findFirst({
    where: { merchantSlug, isEnabled: true, deletedAt: null }
  });

  if (!settings) {
    throw new HttpError(404, "Catalog not found");
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: settings.merchantId } });

  await incrementUsageCounter(prisma, settings.merchantId, "catalogViews", 1);

  const products = await prisma.product.findMany({
    where: {
      merchantId: settings.merchantId,
      deletedAt: null,
      isPublished: true,
      isActive: true
    },
    include: {
      categoryRef: true
    },
    orderBy: [{ category: "asc" }, { name: "asc" }]
  });

  const mappedProducts = products.map((product) => ({
    ...product,
    category: product.categoryRef?.name ?? product.category ?? null
  }));
  const categories = [...new Set(mappedProducts.map((product) => product.category).filter(Boolean))];

  return {
    merchant: toPlain(merchant),
    settings: toPlain(settings),
    categories,
    products: toPlain(mappedProducts)
  };
}

export async function createPublicCatalogCheckout(
  prisma: PrismaClient,
  merchantSlug: string,
  body: z.infer<typeof publicCheckoutSchema>
) {
  const settings = await prisma.catalogSettings.findFirst({
    where: { merchantSlug, isEnabled: true, deletedAt: null }
  });

  if (!settings) {
    throw new HttpError(404, "Catalog not available");
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: settings.merchantId } });

  const branch = await prisma.branch.findFirst({
    where: { merchantId: settings.merchantId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  });

  const products = await prisma.product.findMany({
    where: {
      merchantId: settings.merchantId,
      id: { in: body.items.map((item) => item.productId) },
      deletedAt: null,
      isPublished: true,
      isActive: true
    }
  });

  if (products.length !== body.items.length) {
    throw new HttpError(400, "One or more products are unavailable");
  }

  const byId = new Map(products.map((item) => [item.id, item]));
  const subtotal = body.items.reduce((sum, item) => sum + Number(byId.get(item.productId)!.price) * item.quantity, 0);
  const now = new Date();
  const orderId = randomUUID();
  const orderNumber = `WEB-${now.getUTCFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const [customer, createdOrder] = await prisma.$transaction(async (tx) => {
    const existingCustomer = await tx.customer.findFirst({
      where: {
        merchantId: settings.merchantId,
        phone: body.customerPhone,
        deletedAt: null
      }
    });

    const customer =
      existingCustomer ??
      (await tx.customer.create({
        data: {
          id: randomUUID(),
          merchantId: settings.merchantId,
          name: body.customerName,
          phone: body.customerPhone,
          notes: "Created from online catalog checkout",
          createdAt: now,
          updatedAt: now,
          version: 1,
          lastModifiedByDeviceId: "catalog-web"
        }
      }));

    const order = await tx.order.create({
      data: {
        id: orderId,
        merchantId: settings.merchantId,
        branchId: branch?.id ?? null,
        customerId: customer.id,
        orderNumber,
        status: settings.checkoutPolicy === "CONFIRM_ON_CREATE" ? "CONFIRMED" : "DRAFT",
        documentType: "ORDER",
        source: "ONLINE",
        subtotal,
        discountAmount: 0,
        discountPercent: 0,
        total: subtotal,
        notes: body.notes ?? null,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        confirmedAt: settings.checkoutPolicy === "CONFIRM_ON_CREATE" ? now : null,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: "catalog-web"
      }
    });

    await tx.orderItem.createMany({
      data: body.items.map((item) => ({
        id: randomUUID(),
        merchantId: settings.merchantId,
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(byId.get(item.productId)!.price),
        lineTotal: Number(byId.get(item.productId)!.price) * item.quantity,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: "catalog-web"
      }))
    });

    await tx.publicCatalogOrder.create({
      data: {
        id: randomUUID(),
        merchantId: settings.merchantId,
        orderId: order.id,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        amount: subtotal,
        status: body.paymentMode === "ECOCASH" ? "AWAITING" : "PENDING",
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now
      }
    });

    return [customer, order] as const;
  });

  await incrementUsageCounter(prisma, settings.merchantId, "checkouts", 1);
  await incrementUsageCounter(prisma, settings.merchantId, "ordersPerMonth", 1);

  let paynow: Record<string, unknown> | null = null;
  if (body.paymentMode === "ECOCASH") {
    const payerIdentifier = merchant?.email ?? "support@novoriq.com";
    paynow = await initiatePaynow(prisma, settings.merchantId, payerIdentifier, {
      orderId: createdOrder.id,
      amount: Number(createdOrder.total),
      method: "ecocash",
      phone: body.customerPhone
    });
  }

  return {
    customer: toPlain(customer),
    order: toPlain(createdOrder),
    paynow
  };
}

export async function updateMerchantCatalogSettings(
  prisma: PrismaClient,
  user: {
    merchantId: string;
    deviceId: string;
    userId: string;
    role: string;
    identifier: string;
    branchId: string | null;
    platformAccess: boolean;
  },
  body: z.infer<typeof updateCatalogSettingsSchema>
) {
  const existing = await prisma.catalogSettings.findFirst({
    where: { merchantId: user.merchantId, deletedAt: null }
  });

  if (!existing) {
    throw new HttpError(404, "Catalog settings not found");
  }

  const settings = await prisma.catalogSettings.update({
    where: { id: existing.id },
    data: {
      isEnabled: body.isEnabled ?? existing.isEnabled,
      merchantSlug: body.merchantSlug ?? existing.merchantSlug,
      headline: body.headline ?? existing.headline,
      description: body.description ?? existing.description,
      checkoutPolicy: body.checkoutPolicy ?? existing.checkoutPolicy,
      updatedAt: new Date(),
      version: { increment: 1 },
      lastModifiedByDeviceId: user.deviceId
    }
  });

  await recordAudit(prisma, user as never, {
    action: "catalog.updateSettings",
    entityType: "CatalogSettings",
    entityId: settings.id
  });

  return { settings: toPlain(settings) };
}
