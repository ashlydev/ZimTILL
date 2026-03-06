import type { PrismaClient } from "@prisma/client";
import type { AuthTokenPayload } from "../../lib/token";

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(prisma: PrismaClient, auth: AuthTokenPayload, input: AuditInput): Promise<void> {
  try {
    const metadata = input.metadata == null ? null : (JSON.parse(JSON.stringify(input.metadata)) as any);
    await prisma.auditLog.create({
      data: {
        merchantId: auth.merchantId,
        userId: auth.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata
      }
    });
  } catch {
    // Audit should not block core operations.
  }
}
