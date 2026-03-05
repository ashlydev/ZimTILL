# Sync Spec (V1)

## Protocol

1. PUSH
- Endpoint: `POST /sync/push`
- Request:
  - `{ operations: [{ opId, entityType, opType, entityId, payload, clientUpdatedAt }] }`
- Server behavior:
  - checks `(merchantId, opId)` idempotency
  - applies UPSERT/DELETE scoped to merchant
  - writes `SyncOperationLog`
- Response:
  - `{ acceptedOpIds, rejected, serverTime }`

2. PULL
- Endpoint: `GET /sync/pull?since=<ISO optional>`
- Response:
  - `{ serverTime, changes: { products, customers, orders, orderItems, payments, stockMovements, settings, featureFlags } }`

3. APPLY (mobile)
- Merge each incoming row into SQLite
- Compare `updatedAt`
- Apply only if server row is newer-or-equal than local row

4. ACK
- Remove accepted operations from outbox

## Conflict Resolution

- Strategy: Last Write Wins
- Primary key: `updatedAt`
- Tie-breaker: server row wins when timestamps equal

## Retry and Network Resilience

- Sync runs when online and authenticated
- Triggered on:
  - foreground resume
  - periodic timer
  - manual sync button
- Sync errors are persisted into `sync_state.last_error`
- Queue survives app restarts

## Idempotency

- Every operation has unique `opId`
- Server stores `SyncOperationLog` with unique `(merchantId, opId)`
- Duplicate push operations return accepted without re-applying state
