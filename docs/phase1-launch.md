# Phase 1 Launch Checklist (Sellable Pilot)

This checklist is for moving Novoriq Orders from development into a paid pilot with real merchants.

## Exit Criteria

Phase 1 is complete only when all items below are true:

- API build succeeds (`npm run build:api`).
- API is deployed on HTTPS with managed PostgreSQL and automated backups.
- Paynow live credentials and webhook are working in production.
- Signed Android APK is distributed and installs cleanly on test devices.
- Support contacts are visible in app settings/help.
- At least 3 pilot merchants complete the full flow: login, create order, collect payment, sync.

## 1. Pre-Release Gate (must pass first)

From repo root:

```bash
npm run build:api
npm run test --workspace @novoriq/api
npm run test --workspace @novoriq/mobile
```

If `build:api` fails, do not ship.

## 2. Production Infrastructure

1. Create managed PostgreSQL (recommended: Supabase, Neon, RDS, or Railway Postgres).
2. Create API hosting (recommended: Render, Fly.io, Railway, or a VPS with Docker).
3. Configure HTTPS domain, for example `api.yourdomain.com`.
4. Add daily backups and 7-30 day retention.

## 3. Production Secrets

Set these in your hosting secrets manager (not in git):

- `NODE_ENV=production`
- `PORT=4000` (or hosting-assigned port)
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=<long-random-secret>`
- `JWT_EXPIRES_IN=7d`
- `CORS_ORIGIN=https://your-mobile-web-origin`
- `PAYNOW_INTEGRATION_ID=...`
- `PAYNOW_INTEGRATION_KEY=...`
- `PAYNOW_RESULT_URL=https://api.yourdomain.com/payments/paynow/webhook`
- `PAYNOW_RETURN_URL=https://your-return-url`
- `PAYNOW_TEST_MODE=false` (live mode)

Reference template:

- `apps/api/.env.example`

## 4. Database Migration and Seed (Production)

Run once against production database:

```bash
npm run prisma:generate --workspace @novoriq/api
npm run prisma:migrate --workspace @novoriq/api
```

Use seed only if you want demo data; avoid demo users in live merchant environment:

```bash
npm run seed --workspace @novoriq/api
```

## 5. Paynow Live Verification

1. Ensure webhook URL is publicly reachable over HTTPS.
2. Trigger a small live payment.
3. Verify:
   - `POST /payments/paynow/initiate` returns transaction reference.
   - `POST /payments/paynow/status` updates status correctly.
   - `POST /payments/paynow/webhook` is received and idempotent.
4. Confirm payment appears in order details after sync.

## 6. Mobile Release Build (Sideload)

Set production API URL before building:

`apps/mobile/.env`

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

Build APK:

```bash
npm run build:android-apk
```

If using EAS cloud build:

1. Install EAS CLI: `npm i -g eas-cli`
2. Login: `eas login`
3. Build: `eas build -p android --profile preview`

If using local gradle fallback:

```bash
cd apps/mobile
npx expo prebuild -p android
cd android
./gradlew assembleRelease
```

Output path:

`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

## 7. Versioning and Updates

Before each customer release:

1. Bump `expo.version` in `apps/mobile/app.json`.
2. Build a new APK.
3. Share release notes with fixes/features.
4. Ask merchants to install over existing app.

## 8. Merchant Rollout (First 10 Customers)

1. Onboard each merchant with a 15-minute setup:
   - business profile
   - support contact
   - WhatsApp template
   - payment instructions
2. Test one complete order+payment+sync cycle while present.
3. Collect support channel and escalation contact.

## 9. Operations Rhythm (Weekly)

- Review API logs and sync failures.
- Review Paynow failure reasons and retry patterns.
- Publish one stable APK update if needed.
- Backup verification restore test (at least monthly).

