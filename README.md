# Novoriq Orders

Offline-first mobile order management for Zimbabwean SMEs.

## What Is Included

- End-to-end TypeScript monorepo
- Mobile app: Expo React Native + SQLite offline source of truth
- API: Express + Prisma + PostgreSQL + zod + security middleware
- Shared contracts: `packages/shared`
- Sync engine with outbox, push/pull, idempotency, and LWW merge
- Paynow integration (initiate, poll status, webhook)
- WhatsApp share flow (works offline for message generation)
- Feature flags, V2 endpoint stubs, roadmap/backlog docs
- Branding assets (icons, logos, brand guide)

## Monorepo

- `apps/mobile`
- `apps/api`
- `packages/shared`
- `docs`

## Phase 1 (Sellable Pilot)

Use the production launch checklist:

- `docs/phase1-launch.md`

Minimum release gate:

```bash
npm run build:api
npm run test --workspace @novoriq/api
npm run test --workspace @novoriq/mobile
```

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/api/.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `PAYNOW_INTEGRATION_ID`
- `PAYNOW_INTEGRATION_KEY`
- `PAYNOW_RESULT_URL`
- `PAYNOW_RETURN_URL`

### 3. Start PostgreSQL and apply schema

```bash
npm run prisma:generate --workspace @novoriq/api
npm run prisma:migrate --workspace @novoriq/api
npm run seed --workspace @novoriq/api
```

### 4. Run all services

```bash
npm run dev
```

- API: `http://localhost:4000`
- Expo dev server: shown in terminal/QR

## See It On Your Phone (Step-by-step)

1. Keep phone and laptop on the same Wi-Fi network.
2. Start PostgreSQL and ensure DB is ready.
3. In one terminal, start API:

```bash
npm run dev --workspace @novoriq/api
```

4. Find your laptop LAN IP (Linux):

```bash
ip route get 1.1.1.1 | awk '{print $7; exit}'
```

5. Set mobile API URL in `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_LAN_IP>:4000
```

6. In another terminal, start Expo with cache clear:

```bash
npm run dev --workspace @novoriq/mobile -- --clear
```

7. Install **Expo Go** on Android/iPhone.
8. Scan the QR code from terminal.
9. Open app, register account, create product/customer/order, and test sync.

Troubleshooting:
- If app opens but login/register fails, confirm `EXPO_PUBLIC_API_BASE_URL` uses your LAN IP, not `localhost`.
- If phone cannot connect, allow firewall inbound on port `4000` (API) and Expo ports.
- If network isolation exists, use tunnel mode:
  - `npm run dev --workspace @novoriq/mobile -- --tunnel`
  - expose API with `ngrok http 4000` and point `EXPO_PUBLIC_API_BASE_URL` to ngrok URL.

## Scripts

- `npm run dev`
- `npm run test`
- `npm run build:api`
- `npm run build:android-apk`

## Render Deployment (API)

Render settings:

- Root Directory: leave blank (repo root)
- Runtime: Node
- Node version: 20.x

Build Command (copy exactly):

```bash
npm install &&
npm run prisma:generate --workspace @novoriq/api &&
npm run build --workspace @novoriq/api
```

Start Command (copy exactly):

```bash
npm run prisma:migrate:deploy --workspace @novoriq/api &&
npm run start --workspace @novoriq/api
```

Dist output troubleshooting (verify start target exists):

```bash
npm run build --workspace @novoriq/api
ls -la apps/api/dist
```

Expected start file:

`apps/api/dist/server.js`

Required Render environment variables:

- `DATABASE_URL`
- `NODE_ENV=production`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ORIGIN`
- `PAYNOW_INTEGRATION_ID`
- `PAYNOW_INTEGRATION_KEY`
- `PAYNOW_RESULT_URL`
- `PAYNOW_RETURN_URL`
- `PAYNOW_TEST_MODE`

`DATABASE_URL` format for Render Postgres:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

Use the connection string directly from your Render Postgres service. If password includes special characters, keep the exact URL Render provides (already encoded).

## API Endpoints

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Sync

- `POST /sync/push`
- `GET /sync/pull?since=<ISO>`

### Paynow

- `POST /payments/paynow/initiate`
- `POST /payments/paynow/status`
- `POST /payments/paynow/webhook`

### Optional health

- `GET /health`

## Offline + Sync Behavior

- Local writes always commit to SQLite first.
- Each local write enqueues outbox operation.
- Sync cycle:
  1. Push outbox batch
  2. Pull server changes since `lastPullAt`
  3. Apply deterministic LWW merge
  4. Ack accepted outbox operations
- Idempotency: server ignores duplicate `opId` by `(merchantId, opId)` unique constraint.

### Chosen V1 behavior

- Sales report basis: **sum of confirmed payments**
- If order was confirmed then cancelled: **stock is automatically restocked once**
- Forgot PIN: **stubbed** (non-blocking, documented as V1.1 enhancement)

## Paynow Integration

### Environment variables

- `PAYNOW_INTEGRATION_ID`
- `PAYNOW_INTEGRATION_KEY`
- `PAYNOW_RESULT_URL` (public webhook URL)
- `PAYNOW_RETURN_URL`
- `PAYNOW_TEST_MODE`

### Local webhook testing

Use a tunnel to expose local API:

```bash
# Example with ngrok
ngrok http 4000
```

Then set:

- `PAYNOW_RESULT_URL=https://<ngrok-subdomain>/payments/paynow/webhook`

### Transaction flow

1. Mobile calls `/payments/paynow/initiate`
2. API creates Paynow transaction and stores `PaynowTransaction`
3. User completes payment (redirect or mobile prompt)
4. Mobile polls `/payments/paynow/status` and/or webhook updates API
5. API confirms payment and updates order status
6. Mobile sync pulls latest state

### Failure modes and retries

- Network timeout: retry initiate/status
- Poll returns awaiting: retry status after short interval
- Webhook delays: rely on periodic sync
- Duplicate webhook/status checks: idempotent update logic prevents double payments

### Security note

- Webhook signature/hash verification is enforced in `paynow.service.ts`

## Distribution (No Play Store)

### Debug APK (local device testing)

```bash
cd apps/mobile
npx expo run:android
```

### Release APK (sideloadable)

From monorepo root:

```bash
npm run build:android-apk
```

The script attempts:

1. EAS build (`eas build -p android --profile preview`) if EAS CLI exists
2. Local Gradle fallback:
   - `npx expo prebuild -p android`
   - `cd android && ./gradlew assembleRelease`

APK output (local gradle path):

- `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

### Safe sideload instructions for merchants

1. Transfer APK via WhatsApp/Drive/website.
2. On Android device enable **Install unknown apps** only for trusted source app.
3. Install APK.
4. After install, disable unknown-app install permission again.

### App updates via APK versioning

- Increase Expo `version` in `apps/mobile/app.json`
- Rebuild release APK
- Distribute new APK; user installs over existing app

## Optional PWA Hosting

Build Expo web bundle:

```bash
npm run web --workspace @novoriq/mobile
# or for static export workflow use Expo web build tooling in your CI pipeline
```

Deploy to HTTPS host (Netlify/Vercel).

- Ensure HTTPS enabled
- Open site in Chrome on Android
- Use **Install app** prompt/menu

## Testing

### Backend

Covers:

- register/login service flow
- sync push idempotency
- sync pull tenant scoping

Run:

```bash
npm run test --workspace @novoriq/api
```

### Mobile

Covers:

- outbox enqueue operation generation
- sync merge timestamp behavior

Run:

```bash
npm run test --workspace @novoriq/mobile
```

## Key Docs

- `docs/architecture.md`
- `docs/sync.md`
- `docs/rollout.md`
- `docs/phase1-launch.md`
- `docs/hosting.md`
- `docs/roadmap.md`
- `docs/backlog.md`
- `docs/brand/brand-guidelines.md`

## Brand Assets

- `apps/mobile/assets/icon.png`
- `apps/mobile/assets/adaptive-icon.png`
- `apps/mobile/assets/adaptive-icon-background.png`
- `apps/mobile/assets/splash.png`
- `docs/brand/novoriq-logo-horizontal.png`
- `docs/brand/novoriq-logo-horizontal.svg`
- `docs/brand/novoriq-logo-icon.png`
- `docs/brand/novoriq-logo-icon.svg`
