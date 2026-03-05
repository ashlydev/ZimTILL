# Novoriq Orders Architecture

## Monorepo Structure

- `apps/mobile`: Expo React Native app (Android primary, web installable PWA)
- `apps/api`: Express + Prisma API
- `packages/shared`: shared TypeScript types and zod contracts
- `docs`: architecture, sync, rollout, roadmap, backlog, branding

## Mobile Architecture (Offline-First)

- Local source of truth: SQLite (`expo-sqlite`)
- Every business entity row stores:
  - `id`, `merchantId`, `createdAt`, `updatedAt`, `deletedAt`, `version`, `lastModifiedByDeviceId`
- Outbox queue stores client operations:
  - `opId`, `entityType`, `entityId`, `opType`, `payload`, `createdAt`
- Sync state stores:
  - `lastPullAt`, `lastPushAt`, `lastError`, `deviceId`
- Sync triggers:
  - app resume
  - periodic timer (every 90s while app open)
  - manual “Sync now”

## API Architecture

- Modules by domain:
  - `auth`, `merchants`, `products`, `customers`, `orders`, `payments`, `inventory`, `reports`, `settings`, `sync`, `flags`, `v2`
- Tenant isolation:
  - JWT contains `merchantId`
  - every query scopes by `merchantId`
  - sync payloads rejected if payload `merchantId` mismatches token
- Security:
  - `helmet`
  - `cors`
  - auth rate limiter
  - zod request validation
  - PIN hash via `bcrypt`

## Payments

- Manual payments are stored offline and synced later.
- Paynow integration is API-only.
- Mobile app initiates Paynow and polls status through API.
- Webhook updates from Paynow are idempotent and sync back to devices.

## Conflict Strategy (V1)

- Deterministic Last Write Wins (LWW)
- Compare `updatedAt` timestamps
- Newer row wins
- Duplicate operations ignored by `SyncOperationLog (merchantId + opId)`

## Roadmap Readiness Hooks

- Prisma placeholders included for:
  - `Role`, `User`, `Device`, `FeatureFlag`, `AuditLog`
- V2 endpoints exist as 501 stubs under `/v2/*`
- Feature flag table and local flag cache are active in V1
