import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";

type NotificationInput = {
  merchantId: string;
  branchId?: string | null;
  userId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  severity?: string;
  visibility?: "ALL_STAFF" | "MANAGEMENT";
};

export async function createNotification(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: NotificationInput
): Promise<void> {
  try {
    await prisma.appNotification.create({
      data: {
        merchantId: input.merchantId,
        branchId: input.branchId ?? null,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        severity: input.severity ?? "info",
        visibility: input.visibility ?? "MANAGEMENT"
      }
    });
  } catch {
    // Notifications should not block core workflows.
  }
}
