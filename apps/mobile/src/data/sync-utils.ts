import { generateId } from "../utils/id";

export function createOutboxOperation(entityType: string, entityId: string, opType: "UPSERT" | "DELETE", payload: Record<string, unknown>) {
  return {
    id: generateId(),
    opId: generateId(),
    entityType,
    entityId,
    opType,
    payload,
    createdAt: new Date().toISOString()
  };
}

export function shouldApplyServerChange(localUpdatedAt: string | null, serverUpdatedAt: string): boolean {
  if (!localUpdatedAt) return true;
  return new Date(serverUpdatedAt).getTime() >= new Date(localUpdatedAt).getTime();
}
