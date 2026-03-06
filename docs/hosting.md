# Production Hosting Guide (API + PostgreSQL)

This guide deploys the backend API for Novoriq Orders in a production-safe way.

## Prerequisites

- Managed PostgreSQL database (Neon, Supabase, Railway, RDS, etc.).
- HTTPS API domain (example: `https://api.yourdomain.com`).
- Node 20+ runtime on the server.

## 1. Create Production Environment Variables

Set these in your hosting provider secret manager:

```bash
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://your-mobile-web-domain.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB
JWT_SECRET=replace-with-long-random-32-plus-char-secret
JWT_EXPIRES_IN=7d
PAYNOW_INTEGRATION_ID=your-live-id
PAYNOW_INTEGRATION_KEY=your-live-key
PAYNOW_RESULT_URL=https://api.yourdomain.com/payments/paynow/webhook
PAYNOW_RETURN_URL=https://yourdomain.com/paynow/return
PAYNOW_TEST_MODE=false
```

If Render logs show `Node.js v25.x` and `npm run start` fails, force Node 20:

- Set `NODE_VERSION=20.18.0` in Render environment variables.
- Or use the included `.node-version` and `render.yaml`.

## 2. Build and Validate Before Deploy

From repository root:

```bash
npm install
npm run build:api
npm run test --workspace @novoriq/api
npm run test --workspace @novoriq/mobile
```

## 3. Run Production Migrations

Run this in CI/CD or a release shell with production `DATABASE_URL`:

```bash
npm run prisma:generate --workspace @novoriq/api
npm run prisma:migrate:deploy --workspace @novoriq/api
```

## 4. Start API Process

```bash
npm run build:api
npm run start --workspace @novoriq/api
```

## 5. Health and API Check

```bash
curl -i https://api.yourdomain.com/health
curl -i https://api.yourdomain.com/auth/me
```

Expected:
- `/health` should return 200.
- `/auth/me` should return 401 without token.

## 6. Mobile Production Endpoint

Set mobile app production API URL before building APK:

`apps/mobile/.env`

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

Then build APK:

```bash
npm run build:android-apk
```

## 7. Deployment Checklist

- [ ] DB backups enabled (daily + retention).
- [ ] TLS certificate enabled.
- [ ] Webhook endpoint publicly reachable.
- [ ] Paynow live mode works for a real payment.
- [ ] API logs monitored for sync and payment failures.
- [ ] APK version incremented for each release.
