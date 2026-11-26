# Smart Inventory ERP

نظام عربي لإدارة المخزون ونقاط البيع، يشمل الأصناف والمخازن، والمشتريات، والمبيعات، والتحويلات، والجرد، والمرتجعات، والمصروفات، والتقارير، والصندوق.

## Getting started

### Prerequisites

- Node.js 22
- npm
- Supabase Postgres database
- Android SDK / JDK 21 for APK builds

### Local development

```sh
git clone <repository-url>
cd smart-inventory-erp
npm install
npm run dev
```

Environment variables used by the app/server:

```sh
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LOVABLE_DB_MIGRATION_URL=
LOVABLE_CRON_SECRET=
LOVABLE_CRON_SECRET_PREVIOUS=
```

### Database migrations

- Authoritative migration source: `drizzle/migrations`.
- Latest migration: `drizzle/migrations/0028_security_and_reliability.sql`.
- Completed hardening migration: `drizzle/migrations/0027_db_hardening_and_offline_traces.sql`.
- Both migrations `0027` and `0028` were already applied to the actual Supabase database; do not edit or reapply them during application development.

For a new local database, apply the Drizzle migration set with:

```sh
npx drizzle-kit migrate
```

### Offline inventory sync and cache

- Client inventory data is cached per user and restored when offline.
- Offline RPC writes use the outbox queue and fallback storage:
  - Queue database: `smart-inventory-outbox`
  - RPC queue store: `rpc_operations`
  - Fallback key: `offline_rpc_queue_v1`
- Offline RPC operations are checked against `offline_rpc_allowlist`.
- Retry policy: maximum 6 attempts with exponential backoff up to 5 minutes.
- Conflict handling supports local-versus-server comparison and manual resolution.

### Android APK build

```sh
npm run build:apk
```

This runs the web build, synchronizes Capacitor Android, and executes:

```sh
cd android
./gradlew assembleDebug --stacktrace
```

Individual commands:

```sh
npm run build
npm run cap:sync
npm run cap:open
```

### CI

GitHub Actions runs lint, typecheck, formatting, unit tests, web build, Capacitor sync, and debug APK build for pushes and pull requests targeting `main`.

## Critical paths reviewed in Stage 5

- Sales: draft saving, offline persistence, posting, stock deduction, and final accounting.
- Stock movement: inventory adjustments, stocktakes, transfers, and movement logging.
- Cash and box movements: sale, return, voucher, expense, and cash-shift flows.

## Verification commands

```sh
npm run lint
npx --no-install tsc --noEmit
npm run test -- --run
npm run build
npm run build:apk
```
