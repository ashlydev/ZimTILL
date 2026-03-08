import { generateId } from "../utils/id";

export function createOutboxOperation(
  entityType: string,
  entityId: string,
  opType: "UPSERT" | "DELETE",
  payload: Record<string, unknown>,
  actor: { userId: string; deviceId: string }
) {
  return {
    id: generateId(),
    opId: generateId(),
    entityType,
    entityId,
    opType,
    payload,
    userId: actor.userId,
    deviceId: actor.deviceId,
    createdAt: new Date().toISOString()
  };
}

export function shouldApplyServerChange(localUpdatedAt: string | null, serverUpdatedAt: string): boolean {
  if (!localUpdatedAt) return true;
  return new Date(serverUpdatedAt).getTime() >= new Date(localUpdatedAt).getTime();
}

export function mergePulledRows<T extends { id: string; updatedAt: string }>(localRows: T[], pulledRows: T[]): T[] {
  const merged = new Map(localRows.map((row) => [row.id, row]));

  for (const row of pulledRows) {
    const current = merged.get(row.id);
    if (!current || shouldApplyServerChange(current.updatedAt, row.updatedAt)) {
      merged.set(row.id, row);
    }
  }

  return [...merged.values()];
}
