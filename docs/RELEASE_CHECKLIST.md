# Backend Release Checklist

Use this checklist before backend releases or deployment-impacting PRs. It is not a substitute for human release approval.

Do not assume this exists unless verified in code, CI, deployment configuration, and the target environment.

## Current state

Current state: the repo contains CI/CD workflow files, Railway and Docker configuration, deployment docs, scripts for backup/restore and final deployment checks, migrations folder, generated API docs, and runtime health endpoints.

Known gap: Railway is now the chosen authoritative staging path, but this docs pass did not provision a Railway service, set environment variables, verify MongoDB connectivity, configure Shopify dev-store credentials, or run staging smoke checks. Release readiness is not proven until an operator records that evidence.

## Target state

Target state: release readiness should be verified across code, configuration, tenant isolation, Shopify credentials, mobile/dashboard API compatibility, database safety, webhooks, observability, and rollback.

## Implemented vs future checks

Implemented local/repo checks:

- Type checking, Jest tests, coverage, build, Docker image build verification, security scans, dependency reporting, and best-effort Codecov upload are represented in `.github/workflows/ci.yml`.
- Newman API contract validation runs only when the local `tests/postman` collection and environment files exist. Those files are not currently present, so this check is an explicit skip.
- Staging E2E validation in `.github/workflows/cd.yml` runs only when a local `tests/e2e` suite exists. That suite is not currently present, so this check is an explicit skip.
- Runtime health endpoints `/api/health` and `/api/ready` exist in the backend, but external release smoke checks must still be verified against the chosen environment.

Future/operator verification:

- Provision and verify the authoritative staging deployment path before release. Current staging path: Railway, chosen 2026-07-09 in `docs/DECISIONS.md`.
- Confirm whether Railway also owns production, or whether production uses a separately approved path.
- Confirm required secrets, registry credentials, domains, TLS, database connectivity, Redis/cache needs, webhooks, rollback procedures, and observability in the target environment.
- Confirm release smoke checks against the deployed URL after an operator has chosen and provisioned the deployment path.

## Deployment path status

- Authoritative staging path: Railway. `railway.json` points Railway at the repository `Dockerfile` with `/api/health` as the platform health check. This is the selected staging path, but it does not prove a live Railway service, environment variables, domains, MongoDB readiness, Shopify dev-store configuration, or production readiness.
- AWS/ECS: `.github/workflows/cd.yml` contains AWS/ECS staging, production, backup, blue-green, CloudWatch, Slack, and rollback steps. This path is unverified and now requires manual `workflow_dispatch` with `deployment_path=aws-ecs-unverified`; it must not be treated as the authoritative path until an operator verifies infrastructure and secrets.
- Docker/manual: `Dockerfile`, Docker Compose files, and `docs/DEPLOYMENT.md` exist. They are deployment documentation/options, not proof of an operational production path.
- Production path: not decided by issue #97.

## Railway staging prerequisites

Exact prerequisites to record before treating staging as release-ready:

- API URL: record the Railway-provided or custom staging URL in the release evidence. Do not invent one before provisioning.
- Build/deploy source: Railway service connected to this repository and branch, using `railway.json` and the repository `Dockerfile`.
- Runtime health endpoints: `/api/health` must return HTTP 200; `/api/ready` must return HTTP 200 with `{"ready":true}` after MongoDB connects. A 503 from `/api/ready` means the process is up but database readiness is not proven.
- MongoDB: dedicated staging MongoDB only, never production. Required variable name: `MONGODB_URI`.
- Core runtime env vars by name: `NODE_ENV`, `PORT`, `API_BASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `EMAIL_FROM_ADDRESS`.
- SaaS tenant data: create and verify the staging merchant `Store` database record before smoke tests. Store identity, domain, currency, timezone, country, Shopify connection state, and per-store credentials should come from that record in SaaS staging paths.
- Legacy/single-store fallback env vars by name: `STORE_NAME`, `STORE_DOMAIN`, `STORE_CURRENCY`, `STORE_TIMEZONE`, `STORE_COUNTRY`. These are not the source of truth for multi-tenant staging when `SAAS_MODE` or `MULTI_TENANT_MODE` is set and a `Store` record exists.
- CORS/rate-limit env vars by name: `CORS_ORIGINS` or `ALLOWED_ORIGINS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`.
- Shopify app/dev-store env vars by name only: `SHOPIFY_STORE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_SCOPES`, `SHOPIFY_API_VERSION`, `SHOPIFY_WEBHOOK_URL`.
- Webhook secret env var by name only: `SHOPIFY_WEBHOOK_SECRET`.
- SaaS safety flags by name: `SAAS_MODE` or `MULTI_TENANT_MODE` should be set for staging SaaS verification so legacy global Storefront fallbacks remain blocked.
- Optional service env vars by name, when the corresponding staging feature is enabled: `REDIS_ENABLED`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DATABASE`, `EMAIL_SERVICE_TYPE`, `RESEND_API_KEY`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `SENTRY_DSN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Operator evidence to record: Railway project/service identifier, deployment timestamp or commit SHA, staging API URL, `/api/health` response, `/api/ready` response, MongoDB staging database name/cluster label without credentials, and Shopify dev-store domain without tokens.

Current blocker status (updated issue #116, 2026-07-21): Railway staging is provisioned and verified — staging URL, `/api/health`, and `/api/ready` are recorded below. Issue #115 (Shopify Partners dev store) is closed; Shopify dev-store credentials are configured and the OAuth connection was verified live (`shopify.isConnected: true` on the staging `Store` record — see below). Note: the Shopify app originally created for issue #115 was a store-admin "custom app" (Settings → Apps and sales channels → Develop apps), which does not support the OAuth authorization-code redirect flow this codebase implements (no `App URL`/redirect-URL configuration exists for that app type). A second Shopify app was created via the Shopify Dev Dashboard specifically to support OAuth, and its credentials are what's configured in Railway now. `SHOPIFY_WEBHOOK_SECRET` is present in Railway, but live webhook HMAC delivery was not exercised in this pass. Do not run Shopify webhook delivery tests, mobile/backend smoke tests, or first-merchant checkout validation until an operator records that live-delivery evidence separately (see `docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md`, issues #99/#109).

### Railway staging evidence record (issue #107) — operator work

Issue #107 is an operator provisioning and verification gate. This repository
does not contain Railway project access, a staging URL, a staging MongoDB
connection, Shopify development-store credentials, webhook secrets, live
runtime configuration-validation output, or live health/readiness responses. Do
not mark this gate complete from documentation alone, and do not paste secrets
or connection strings into this file.

| Required evidence | Current status | Evidence recorded |
| --- | --- | --- |
| Railway project/service identifier | Recorded (issue #116) | Railway project `charming-energy`, environment `staging`, service `cartaisy-backend-staging`. |
| Deployed backend commit SHA or deployment timestamp | Recorded (issue #116) | Commit `4d1136d739cb73bbf8e0ff6a08c9d6847ba21168` (`main` branch), deployed 2026-07-20. |
| Staging API URL | Recorded (issue #116) | `https://cartaisy-backend-staging-staging.up.railway.app` |
| `/api/health` response | Recorded (issue #116) | HTTP 200, body `OK`, checked 2026-07-20. |
| `/api/ready` response | Recorded (issue #116) | HTTP 200, body `{"ready":true}`, checked 2026-07-20. |
| Dedicated staging MongoDB label/name | Recorded (issue #116) | Railway MongoDB service in the `staging` environment, database `cartaisy_staging` — a separate Railway service/instance from `production`; never shares data or connection details with it. |
| Mandatory staging configuration audit | Partial (issue #116) | MongoDB connectivity is confirmed live via `/api/ready` (HTTP 200, `{"ready":true}`). `JWT_SECRET` is confirmed present and functional — register/login successfully issued and verified JWT tokens. This also indirectly confirms `JWT_SECRET` is non-empty and at least 32 characters: `validateRequiredConfig()` treats an empty/short `JWT_SECRET` as an unconditional critical error that throws before `mongoose.connect()` runs (the same failure mode observed earlier in this pass when `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET` were briefly missing — cascading Mongoose buffering timeouts with no working `/api/ready`); since register/login and `/api/ready` worked, that specific check passed. However, `validateRequiredConfig()`'s check for the exact known default placeholder `JWT_SECRET` value is only a critical error when `NODE_ENV` is exactly `production` — it is just a warning otherwise — and a critical validation failure does not crash or exit the Node process in `src/server.ts` (it's caught and logged; only downstream DB connectivity is affected, not process liveness). So a successful boot does not by itself prove `JWT_SECRET` isn't the known default placeholder value unless staging's `NODE_ENV` is confirmed to be exactly `production`. Treat `JWT_SECRET`'s non-default status as unverified until `NODE_ENV`'s exact value and `validateRequiredConfig()`'s actual logged output are captured. `NODE_ENV`, `PORT`, `API_BASE_URL`, `FRONTEND_URL`, `EMAIL_FROM_ADDRESS`, and `SAAS_MODE` are confirmed present in Railway but were not independently runtime-verified beyond successful app startup in this pass — do not treat their presence alone as proof they are valid/non-default. Shopify dev-store variables (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STORE_URL`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_SCOPES`, `ENCRYPTION_KEY`) are present in Railway and confirmed live: the full OAuth authorization-code flow was executed end-to-end against a live Shopify app and the staging `Store` record now shows `shopify.isConnected: true` (see below). `SHOPIFY_WEBHOOK_SECRET` is present in Railway but not runtime-exercised — no live webhook was delivered in this pass. `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS` are present; note `CORS_ORIGINS`/`ALLOWED_ORIGINS` are not currently consumed by the live CORS middleware in `src/app.ts` (hardcoded allow-all-origins), so setting them has no effect on current runtime behavior. |
| Shopify development-store domain | Recorded (issue #116) | `cartaisy-basic-test.myshopify.com` (issue #115 dev store). OAuth-authorized scopes returned by the live connection: `read_customers, write_inventory, write_orders, write_products`. |
| Staging `Store` record | Recorded (issue #116) | Store id `6a5f46b302669bae116c348e`, created via `POST /api/v1/auth/register`, active, `shopify.isConnected: true` (verified live via `GET /api/v1/shopify/status`, connected 2026-07-21). |
| Webhook secret configured | Recorded (issue #116) — presence only | `SHOPIFY_WEBHOOK_SECRET` is set in Railway (presence confirmed per operator security rule; value not recorded). Live HMAC webhook delivery was not exercised in this pass — see `docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md` for that follow-up. |
| Env vars named in issue #116 but not applicable to live code (reviewed issue #116) | Reviewed — intentionally not set | `JWT_REFRESH_SECRET` (named in issue #116's steps) does not exist anywhere in the codebase; `src/utils/jwt.ts` signs both access and refresh tokens with the same `JWT_SECRET`. The global env vars `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`, and `SHOPIFY_WEBHOOK_URL` are read only by the legacy single-tenant global-fallback singleton in `src/services/shopifyStorefrontService.ts` (constructor logs a warning and disables that client if unset — it does not throw); leaving those *global env vars* unset is correct for this per-store OAuth path. |
| Known real gap: per-store Storefront API token not configured (found in issue #116 review) | Not connected — separate from Admin OAuth | The Shopify OAuth flow run in this pass (`saveCredentials()` in `src/services/shopifyOAuthService.ts`) only stores the Admin API token, scope, and `isConnected` state on the `Store` document. It does not set `Store.shopify.storefrontAccessToken`. `getStorefrontClientForStore()` in `src/services/shopifyStorefrontService.ts` requires that per-store field and fails closed with "Store missing Storefront API access token" if it's absent — this is unrelated to the legacy global `SHOPIFY_STOREFRONT_ACCESS_TOKEN` env var above. A route/controller search of `src/routes/shopifyRoutes.ts`, `src/routes/adminRoutes.ts`, `src/routes/storeAdminRoutes.ts`, and the admin/store-settings controllers found no existing endpoint to set this per-store field. **Practical effect**: this staging store's Admin OAuth connection is verified live, but store-scoped Storefront API calls (mobile-facing product listing, cart, checkout handoff) will fail for this store until a Storefront API access token is obtained (e.g. via a Shopify Admin GraphQL `storefrontAccessTokenCreate` call using the connected Admin token) and a way to persist it to `Store.shopify.storefrontAccessToken` is added. This is a genuine follow-up gap, not a "not applicable" item — filed as a separate concern from issue #116's Railway/OAuth provisioning scope. |
| SaaS safety flags configured | Recorded (issue #116) | `SAAS_MODE` is set to `true` on the staging service. |

Operator verification commands to run after the Railway staging URL is known:

```bash
curl -i "$STAGING_API_URL/api/health"
curl -i "$STAGING_API_URL/api/ready"
```

Also run an explicit staging configuration audit against the Railway
environment before recording this gate as complete. `validateRequiredConfig()`
output is useful supporting evidence, but it is not sufficient by itself
because some mandatory staging fields are outside its critical-error checks.
The audit must fail closed for every missing, blank, default, or invalid
required staging field listed in "Railway staging prerequisites", including
Shopify app/dev-store fields, `SHOPIFY_WEBHOOK_SECRET`, SaaS safety flags, CORS,
and rate-limit settings. Record only the audit name/command, timestamp, deploy
identifier, and sanitized field/group pass/fail summary. Do not record secret
values. `/api/health` and `/api/ready` alone are not sufficient evidence for
auth, Shopify, webhook, CORS, or rate-limit configuration.

Minimum mandatory staging config audit coverage:

| Config group | Required sanitized result |
| --- | --- |
| MongoDB | `MONGODB_URI` present, non-default, points to the dedicated staging database label recorded above. |
| Core runtime | `NODE_ENV`, `PORT`, `API_BASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, and `EMAIL_FROM_ADDRESS` present, non-default where applicable, and format-valid. |
| Shopify dev-store | `SHOPIFY_STORE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_SCOPES`, `SHOPIFY_API_VERSION`, and `SHOPIFY_WEBHOOK_URL` present and tied to the recorded development store. |
| Webhooks | `SHOPIFY_WEBHOOK_SECRET` present and the webhook URL targets the staging backend. |
| SaaS safety | `SAAS_MODE` or `MULTI_TENANT_MODE` enabled for staging SaaS verification. |
| CORS/rate limits | `CORS_ORIGINS` or `ALLOWED_ORIGINS`, `RATE_LIMIT_WINDOW_MS`, and `RATE_LIMIT_MAX_REQUESTS` present and reviewed for staging. |

Expected sanitized readiness evidence:

```text
Staging API URL: https://cartaisy-backend-staging-staging.up.railway.app
Railway project/service label: charming-energy / staging / cartaisy-backend-staging
Backend commit SHA: 4d1136d739cb73bbf8e0ff6a08c9d6847ba21168
MongoDB staging database label: cartaisy_staging (dedicated Railway MongoDB service, staging environment)
Shopify dev-store domain: cartaisy-basic-test.myshopify.com
Shopify OAuth scopes granted: read_customers, write_inventory, write_orders, write_products
Store record id: 6a5f46b302669bae116c348e
Store active/connected: active, shopify.isConnected=true (verified live via GET /api/v1/shopify/status, connected 2026-07-21T12:35:33.865Z)
Mandatory staging config audit: partial — see evidence table above
Audit command/check name: manual review of Railway service Variables, live /api/health and /api/ready checks, and a full live Shopify OAuth authorization-code round trip
Audit timestamp: 2026-07-20 / 2026-07-21
Audit deploy identifier: commit 4d1136d739cb73bbf8e0ff6a08c9d6847ba21168
Sanitized field/group pass-fail summary: MongoDB PASS (live), JWT_SECRET PASS on length/non-empty (inferred from successful DB connectivity per validateRequiredConfig() sequencing) + non-default status UNVERIFIED (that check only errors when NODE_ENV=production; does not crash the process either way), core runtime + SaaS safety PRESENT (not independently runtime-verified beyond app startup), rate-limit vars present (CORS_ORIGINS/ALLOWED_ORIGINS not wired into runtime CORS behavior — see note above), Shopify Admin OAuth PASS (live connection verified), Shopify Storefront API token FAIL/NOT CONFIGURED (per-store storefrontAccessToken not set by the OAuth flow — see note above; mobile storefront calls will fail for this store), webhook secret PRESENT (not exercised — no live webhook delivered)
validateRequiredConfig supporting result: not separately captured from Railway logs in this pass
Config warning field names reviewed: not separately captured in this pass
SaaS safety flag status: SAAS_MODE=true
/api/health HTTP status: 200
/api/ready HTTP status: 200
/api/ready body: {"ready":true}
```

## Pre-release checks

- Confirm the release scope and risk level.
- Confirm the branch and PR only include intended changes.
- Run relevant checks from `docs/TESTING.md`.
- Verify CI status in GitHub, not only local commands.
- Confirm generated artifacts such as `public/swagger.json` are intentionally updated when API contracts change.
- Review `.github/pull_request_template.md` and include changed files, commands, risks, untouched areas, and follow-ups in the PR.

## Environment and secrets checks

- Confirm required environment variables are set in the target environment.
- Confirm no `.env`, credentials, tokens, private keys, API secrets, webhook secrets, or merchant-specific secrets are committed.
- Confirm Shopify Admin/private credentials stay backend-only.
- Confirm mobile/dashboard clients receive only safe public config and API responses.
- Verify production secret-management changes only under explicit approved scope.

## Tenant isolation checks

- Confirm every tenant-owned query includes `storeId` or a verified store context.
- Confirm authenticated customer routes derive store context from the customer record.
- Confirm dashboard/admin routes validate requested store context against the authenticated user's store unless an explicit approved cross-store role exists.
- Confirm background jobs, schedulers, webhooks, analytics, and sync operations use the correct store context.
- Review `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` for known ownership risks.

## Shopify credentials and config checks

- Confirm tenant-specific Shopify calls use store-scoped Storefront/Admin credentials.
- Confirm no SaaS/prod runtime path falls back to global Shopify credentials or the first connected store for tenant-specific calls.
- Confirm Shopify OAuth, token storage, token decryption, and webhook secrets are verified for the target merchant/store.
- Review `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md` and `docs/cartaisy/SHOPIFY_API_POLICY.md`.

## API compatibility checks for mobile and dashboard

- Confirm changed response shapes are backwards-compatible or coordinated with mobile/dashboard releases.
- Regenerate OpenAPI artifacts when controller/API contracts change.
- Verify mobile-facing routes for home, product, search, recommendations, store config, cart, checkout entry, account, and notifications when relevant.
- Verify dashboard/admin routes for store settings, branding, home modules, customers, orders, security, email, compliance, notifications, and Shopify sync when relevant.

## Database and migration checks

- Confirm whether a migration is required.
- Review `migrations/`, `src/scripts/`, and deployment scripts before running data changes.
- Confirm backup and restore procedures before production data changes.
- Include rollback/migration notes for schema, index, or data changes.
- Do not add or run migrations from docs-only issues.

### Product tenancy migration gates (issue #78) — operator work

Blockers before onboarding a second store, and before any release that
depends on multi-store product safety. Follow the runbook in
`docs/PRODUCT_TENANCY_MIGRATION.md` per environment (staging, then
production) and record the evidence in its "Execution status" table. All
steps must be executed by the project owner/operator with a database backup
— never by AI agents against shared environments.

Staging status update (issue #108): no operator staging output was provided in
the issue body or comments, and this docs update did not run staging database
reads, writes, migrations, deployments, or Shopify actions. The release gates
below remain unchecked until the project owner/operator records staging
evidence in `docs/PRODUCT_TENANCY_MIGRATION.md`.

| Staging product gate | Current status | Evidence recorded |
| --- | --- | --- |
| Database backup before product migration gates | Pending operator execution | Not provided in issue #108. |
| Product dry run | Pending operator execution | Not provided in issue #108. |
| Product real backfill | Pending operator approval/execution | Not provided in issue #108. |
| Storeless Product count | Pending operator verification | Not provided in issue #108; expected `0` after successful backfill. |
| Product counts by store | Pending operator verification | Not provided in issue #108. |
| Store-scoped Product compound unique indexes | Pending operator verification | Not provided in issue #108. |
| Legacy global unique Product indexes | Pending operator verification | Not provided in issue #108; expected `[]` for legacy single-field unique index query. |
| Product rollback notes | Pending operator record | Not provided in issue #108. |

- [ ] Dry run completed (`backfillProductStoreId.ts --dry-run`) and its output reviewed: correct target store, plausible product sample, before-picture "Product counts by store" recorded.
- [ ] Real backfill completed; `db.products.countDocuments({ storeId: { $exists: false } })` returns `0`.
- [ ] Product counts by store verified against the dry-run before-picture (script output or the aggregate in the runbook).
- [ ] Legacy global unique indexes (`shopifyProductId_1`, `handle_1`, `seo.slug_1`) checked and dropped where present (`--drop-legacy-indexes`); `db.products.getIndexes()` shows no single-field unique index on those fields.
- [ ] Store-scoped compound unique indexes verified present (`{ storeId, shopifyProductId }`, `{ storeId, handle }`, `{ storeId, "seo.slug" }`) — the script prints this verdict on every run.
- [ ] Product rollback notes recorded: restore the backup, or if the backfill target was wrong and no later writes depend on it, unset only the recorded product IDs changed in this gate and re-create any dropped legacy unique indexes only if rolling back permanently.

Exact Mongo verification commands to record after each environment run:

```javascript
db.products.countDocuments({
  $or: [{ storeId: { $exists: false } }, { storeId: null }]
})

db.products.aggregate([
  { $group: { _id: "$storeId", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])

db.products.getIndexes().filter(index =>
  index.unique === true &&
  [
    JSON.stringify({ storeId: 1, shopifyProductId: 1 }),
    JSON.stringify({ storeId: 1, handle: 1 }),
    JSON.stringify({ storeId: 1, "seo.slug": 1 })
  ].includes(JSON.stringify(index.key))
)

db.products.getIndexes().filter(index =>
  index.unique === true &&
  [
    JSON.stringify({ shopifyProductId: 1 }),
    JSON.stringify({ handle: 1 }),
    JSON.stringify({ "seo.slug": 1 })
  ].includes(JSON.stringify(index.key))
)
```

Expected: storeless product count is `0`, per-store counts match the dry-run
record, three store-scoped compound unique indexes are present, and the legacy
global unique index query returns `[]`.

### Customer/order legacy storeId backfill gates (issue #89) — operator work

Blockers before onboarding a second store, and before any release that depends
on customer/order sync or webhook matching being tenant-safe. These gates cover
legacy Shopify-created customer `User` records and legacy Shopify-synced
`Order` records that predate store-scoped customer/order sync. All steps must be
executed by the project owner/operator with a database backup — never by AI
agents against shared environments.

These commands assume a single-store legacy deployment where every storeless
Shopify customer `User` or `Order` record belongs to the target store. If more
than one store may already own storeless legacy records, stop and partition
records per merchant first (for example by matching Shopify exports), then run
one scoped update per store. Do not stamp one store ID across mixed-tenant data.
The separate `customers` collection already requires `storeId`; verify it has no
storeless records, but do not backfill it unless a human review identifies
legacy storeless documents and their owning store.

#### Staging

Staging status update (issue #108): no operator staging output was provided in
the issue body or comments, and this docs update did not run customer/order
database reads, writes, or backfills. All staging customer/order gates remain
unchecked until the project owner/operator records the counts, exact IDs, index
query results, and rollback notes from the staging database.

| Staging customer/order gate | Current status | Evidence recorded |
| --- | --- | --- |
| Backup/snapshot before customer/order backfill | Pending operator execution | Not provided in issue #108. |
| Storeless Customer count | Pending operator verification | Not provided in issue #108. |
| Storeless Shopify customer `User` count | Pending operator verification | Not provided in issue #108. |
| Storeless Shopify `Order` count | Pending operator verification | Not provided in issue #108. |
| Exact `User` IDs to backfill | Pending operator record | Not provided in issue #108. |
| Exact `Order` IDs to backfill | Pending operator record | Not provided in issue #108. |
| Customer/User/Order real backfill | Pending operator approval/execution | Not provided in issue #108. |
| Store-scoped customer/user/order indexes | Pending operator verification | Not provided in issue #108. |
| Legacy global unique customer/user/order indexes | Pending operator verification | Not provided in issue #108; expected `[]` for legacy global unique index queries. |
| Rollback notes | Pending operator record | Not provided in issue #108. |

- [ ] Backup/snapshot recorded before customer/order backfill.
- [ ] Dry-run counts recorded and reviewed:
  ```javascript
  const storelessStoreId = { $or: [{ storeId: { $exists: false } }, { storeId: null }] }

  db.customers.countDocuments(storelessStoreId)
  db.users.countDocuments({ ...storelessStoreId, role: "customer", shopifyCustomerId: { $exists: true } })
  db.orders.countDocuments({ ...storelessStoreId, shopifyOrderId: { $exists: true } })
  db.customers.find(
    storelessStoreId,
    { _id: 1, email: 1 }
  ).limit(20)
  db.users.find(
    { ...storelessStoreId, role: "customer", shopifyCustomerId: { $exists: true } },
    { _id: 1, email: 1, shopifyCustomerId: 1 }
  ).limit(20)
  db.orders.find(
    { ...storelessStoreId, shopifyOrderId: { $exists: true } },
    { _id: 1, orderNumber: 1, shopifyOrderId: 1, email: 1, "guestContact.email": 1 }
  ).limit(20)
  ```
- [ ] Exact records to backfill recorded before the real run:
  ```javascript
  const storelessStoreId = { $or: [{ storeId: { $exists: false } }, { storeId: null }] }
  const userBackfillIds = db.users
    .find({ ...storelessStoreId, role: "customer", shopifyCustomerId: { $exists: true } }, { _id: 1 })
    .map(doc => doc._id)
  const orderBackfillIds = db.orders
    .find({ ...storelessStoreId, shopifyOrderId: { $exists: true } }, { _id: 1 })
    .map(doc => doc._id)

  userBackfillIds
  orderBackfillIds
  ```
- [ ] Real customer/order backfill completed by the operator using the recorded IDs:
  ```javascript
  db.users.updateMany(
    { _id: { $in: userBackfillIds } },
    { $set: { storeId: ObjectId("<storeId>") } }
  )
  db.orders.updateMany(
    { _id: { $in: orderBackfillIds } },
    { $set: { storeId: ObjectId("<storeId>") } }
  )
  ```
- [ ] Storeless Customer/User/Order counts verified as `0`:
  ```javascript
  const storelessStoreId = { $or: [{ storeId: { $exists: false } }, { storeId: null }] }

  db.customers.countDocuments(storelessStoreId)
  db.users.countDocuments({ ...storelessStoreId, role: "customer", shopifyCustomerId: { $exists: true } })
  db.orders.countDocuments({ ...storelessStoreId, shopifyOrderId: { $exists: true } })
  ```
- [ ] Store-scoped customer/order indexes verified:
  ```javascript
  db.customers.getIndexes().filter(index =>
    index.unique === true &&
    JSON.stringify(index.key) === JSON.stringify({ storeId: 1, email: 1 })
  )
  db.users.getIndexes().filter(index =>
    [
      JSON.stringify({ storeId: 1, email: 1 }),
      JSON.stringify({ storeId: 1, shopifyCustomerId: 1 })
    ].includes(JSON.stringify(index.key))
  )
  db.orders.getIndexes().filter(index =>
    index.unique === true &&
    [
      JSON.stringify({ storeId: 1, shopifyOrderId: 1 }),
      JSON.stringify({ storeId: 1, orderNumber: 1 })
    ].includes(JSON.stringify(index.key))
  )
  ```
  Expected: the customer `{ storeId: 1, email: 1 }` unique index is present,
  both user indexes are present, both order compound unique indexes are present,
  and the `{ storeId: 1, email: 1 }` user index is unique.
- [ ] Legacy global unique customer/user/order indexes verified absent:
  ```javascript
  db.customers.getIndexes().filter(index =>
    index.unique === true &&
    JSON.stringify(index.key) === JSON.stringify({ email: 1 })
  )
  db.users.getIndexes().filter(index =>
    index.unique === true &&
    [
      JSON.stringify({ email: 1 }),
      JSON.stringify({ shopifyCustomerId: 1 })
    ].includes(JSON.stringify(index.key))
  )
  db.orders.getIndexes().filter(index =>
    index.unique === true &&
    [
      JSON.stringify({ shopifyOrderId: 1 }),
      JSON.stringify({ orderNumber: 1 })
    ].includes(JSON.stringify(index.key))
  )
  ```
  Expected: each query returns `[]`.
- [ ] Rollback notes recorded: restore the backup, or if the backfill target was wrong and no later writes depend on it, unset only the recorded IDs changed in this gate:
  ```javascript
  db.users.updateMany(
    { _id: { $in: userBackfillIds }, storeId: ObjectId("<storeId>") },
    { $unset: { storeId: "" } }
  )
  db.orders.updateMany(
    { _id: { $in: orderBackfillIds }, storeId: ObjectId("<storeId>") },
    { $unset: { storeId: "" } }
  )
  ```

#### Production

- [ ] Repeat the staging gates against production only after staging evidence is approved.
- [ ] Production backup/snapshot recorded before customer/order backfill.
- [ ] Production dry-run counts, real-run update results, verification outputs, and rollback notes recorded.

## Webhook and sync checks

- Confirm webhook signature validation and event-to-store mapping.
- Confirm idempotency, retry behavior, and failure logging where relevant.
- Confirm sync jobs use store-scoped credentials and do not overwrite another merchant's data.
- Verify webhook URLs and secrets in the target environment.

## First-merchant checkout webhook smoke

Before private beta, an operator must run
`docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md` against an
approved Shopify development or generated-test-data store and a reachable
backend environment.

Current status (issues #99 and #109): runbook prepared; issue #109 attempted
to execute it but was blocked before checkout handoff because no verified
Railway staging URL, health/readiness output, staging `Store` id/shop-domain
evidence, Storefront credential presence, webhook secret/configuration
evidence, webhook URL, Shopify development-store domain, test cart, or operator
approval for live Railway/Shopify actions was available. This docs update did
not run staging database reads/writes, Shopify checkout, webhook delivery
tests, production/staging deployments, or live credential actions. Do not check
the gates below until an operator records real smoke evidence.

Issue #109 evidence summary:

| Gate | Current status | Evidence recorded |
| --- | --- | --- |
| Checkout handoff returns Shopify-hosted URL | Blocked before execution | Not called; staging/backend/store/cart prerequisites were not available. |
| Order webhook reconciliation verified | Blocked before execution | Not verified; no Shopify test checkout or webhook delivery was generated. |
| Guest/customer attribution checked | Blocked before execution | Not tested; smoke run did not reach checkout handoff. |
| Follow-up defects filed | Not evaluated | No focused defect issue was filed because the smoke run was blocked before any backend, mobile, or Shopify runtime behavior was exercised. |

- [ ] Backend commit, environment, and store description recorded without secrets.
- [ ] Store record exists and is active/connected for the test store.
- [ ] Storefront credentials are confirmed store-scoped.
- [ ] `SHOPIFY_WEBHOOK_SECRET` is configured in the target environment without recording the value.
- [ ] Shopify order webhook delivery reaches the backend URL.
- [ ] `POST /api/v1/checkout/handoff` returns a `checkoutUrl`.
- [ ] Shopify test checkout completes without a real payment transaction.
- [ ] Order webhook is accepted after HMAC verification and shop-domain mapping.
- [ ] Matching `CheckoutHandoff` is reconciled.
- [ ] Local `Order` is created or updated with the correct `storeId`.
- [ ] Guest attribution is tested or explicitly marked not practical.
- [ ] Customer attribution is tested or explicitly marked not practical.
- [ ] Failures are classified as backend, mobile/API client, Shopify config, or environment follow-ups.

## Rollback notes

- Identify the previous deployable version or Docker image.
- Confirm database changes are backward-compatible or have a documented rollback path.
- Confirm feature flags or config toggles if applicable.
- Confirm smoke checks after rollback, including `/api/health`, `/api/ready`, and critical mobile/dashboard routes.

## Known gaps

Known gap: release workflow files describe staging, production, backups, blue-green deployment, and rollback, but this docs pass did not prove they are wired to live infrastructure.

- Treat release-readiness claims as pending human/operator verification.
- Treat checkout, payment, auth, tenant isolation, Shopify credentials, webhooks, and migrations as high-risk release areas.
- Backend release readiness does not prove mobile, dashboard, app-store, or merchant onboarding readiness.

## Related docs/issues

- GitHub issue: #52.
- `docs/TESTING.md`
- `docs/STATUS.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
- `docs/cartaisy/AGENT_WORKFLOW.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- `.github/workflows/ci.yml`
- `.github/workflows/cd.yml`
