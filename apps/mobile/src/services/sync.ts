import { SyncPullResponse, SyncPushResponse } from "@novoriq/shared";
import {
  ackOutbox,
  applySyncChanges,
  getSyncState,
  listOutbox,
  setSyncState
} from "../data/repository";
import { apiRequest } from "./api";

type SyncNowInput = {
  token: string;
  merchantId: string;
  userId: string;
  deviceId: string;
};

function normalizeOrderPayload(payload: Record<string, unknown>) {
  const status = String(payload.status ?? "");
  const confirmedAt = typeof payload.confirmedAt === "string" ? payload.confirmedAt : null;
  const fallback = String(payload.updatedAt ?? payload.createdAt ?? new Date().toISOString());

  return {
    ...payload,
    confirmedAt: ["CONFIRMED", "PARTIALLY_PAID", "PAID"].includes(status) ? confirmedAt ?? fallback : null
  };
}

export async function syncNow(input: SyncNowInput): Promise<{ pushed: number; pulled: number; serverTime: string }> {
  const state = await getSyncState();
  const outbox = await listOutbox(200);

  let acceptedOpIds: string[] = [];
  let serverTime = new Date().toISOString();

  if (outbox.length > 0) {
    const push = await apiRequest<SyncPushResponse>("/sync/push", {
      method: "POST",
      token: input.token,
      body: {
        operations: outbox.map((op) => ({
          opId: op.opId,
          entityType: op.entityType,
          opType: op.opType,
          entityId: op.entityId,
          payload: op.entityType === "order" ? normalizeOrderPayload(op.payload) : op.payload,
          clientUpdatedAt: op.clientUpdatedAt,
          userId: op.userId ?? input.userId,
          deviceId: op.deviceId ?? input.deviceId
        }))
      }
    });

    acceptedOpIds = push.acceptedOpIds;
    serverTime = push.serverTime;
    if (acceptedOpIds.length > 0) {
      await ackOutbox(acceptedOpIds);
      await setSyncState({ lastPushAt: push.serverTime, lastError: null });
    }
  }

  const since = state.last_pull_at;
  const pullPath = since ? `/sync/pull?since=${encodeURIComponent(since)}` : "/sync/pull";
  const pull = await apiRequest<SyncPullResponse>(pullPath, {
    token: input.token
  });

  await applySyncChanges(input.merchantId, pull.changes);
  await setSyncState({ lastPullAt: pull.serverTime, lastError: null });

  const pulledCount =
    pull.changes.products.length +
    pull.changes.customers.length +
    pull.changes.orders.length +
    pull.changes.orderItems.length +
    pull.changes.payments.length +
    pull.changes.stockMovements.length +
    pull.changes.settings.length;

  return {
    pushed: acceptedOpIds.length,
    pulled: pulledCount,
    serverTime: pull.serverTime || serverTime
  };
}
