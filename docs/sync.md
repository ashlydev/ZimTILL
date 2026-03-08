# Sync Model

## Owner and Staff Data Model

- Business data is owned by the merchant, not by a single device.
- Every synced row remains scoped by `merchantId`.
- Staff users and the owner share the same merchant dataset.
- Audit fields identify who last changed a row:
  - `createdByUserId`
  - `updatedByUserId`
  - `lastModifiedByDeviceId`
- This means a cashier can create orders offline, sync later, and the owner can pull the same merchant data onto another device.

## Device and Outbox Flow

Each device keeps a local source of truth plus an outbox.

1. User signs in on a device.
2. The device is registered under that user.
3. Every local mutation writes to the local database first.
4. The same mutation is appended to the device outbox with:
   - `opId`
   - `entityType`
   - `entityId`
   - `opType`
   - `payload`
   - `clientUpdatedAt`
   - `userId`
   - `deviceId`
5. When online, sync runs in this order:
   - push outbox
   - pull merchant changes since `lastPullAt`
   - merge pulled rows into local storage

## Server Push Rules

- `merchantId` is derived from the auth token.
- `userId` and `deviceId` from the token are enforced against each operation.
- Duplicate `opId` values are ignored through `SyncOperationLog`.
- Disabled users cannot push or pull.
- Revoked devices cannot push or pull.
- Soft deletes update `deletedAt`, `updatedAt`, `updatedByUserId`, and `lastModifiedByDeviceId`.

## Conflict Resolution

- Conflict policy is last-write-wins by `updatedAt`.
- If timestamps differ, the newer `updatedAt` wins.
- If timestamps are equal, the server version wins.
- This rule is applied consistently for owner and staff devices so merges stay deterministic.

## Owner Visibility

- After a staff device pushes changes, those rows are stored under the shared merchant.
- When the owner device pulls, it receives the same merchant-scoped rows.
- Audit fields let the UI show who created or last updated orders and payments when that information is available locally.
