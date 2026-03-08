import { PrismaClient } from "@prisma/client";

export async function updateOrderPaymentStatus(
  prisma: PrismaClient,
  orderId: string,
  merchantId: string,
  audit?: { userId?: string | null; deviceId?: string | null }
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, merchantId, deletedAt: null } });
  if (!order) return;

  const payments = await prisma.payment.findMany({
    where: { orderId, merchantId, deletedAt: null, status: "CONFIRMED" }
  });

  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const total = Number(order.total);

  let status = order.status;
  if (paid <= 0) {
    if (order.status === "PAID" || order.status === "PARTIALLY_PAID") {
      status = "CONFIRMED";
    }
  } else if (["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(order.status)) {
    status = paid >= total ? "PAID" : "PARTIALLY_PAID";
  }

  if (status !== order.status) {
    const now = new Date();
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status,
        confirmedAt: ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(status) ? order.confirmedAt ?? now : null,
        updatedAt: now,
        updatedByUserId: audit?.userId ?? order.updatedByUserId ?? null,
        lastModifiedByDeviceId: audit?.deviceId ?? order.lastModifiedByDeviceId,
        version: { increment: 1 }
      }
    });
  }
}

export function formatCurrency(symbol: string, amount: number): string {
  return `${symbol}${amount.toFixed(2)}`;
}
