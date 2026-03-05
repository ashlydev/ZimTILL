import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const baseSyncEntitySchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
  lastModifiedByDeviceId: z.string().min(1)
});

export function assertTenant(payloadMerchantId: string, authMerchantId: string): void {
  if (payloadMerchantId !== authMerchantId) {
    throw new Error("Cross-tenant operation rejected");
  }
}
