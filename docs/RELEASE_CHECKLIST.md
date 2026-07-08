# Backend Release Checklist

Use this checklist before backend releases or deployment-impacting PRs. It is not a substitute for human release approval.

Do not assume this exists unless verified in code, CI, deployment configuration, and the target environment.

## Current state

Current state: the repo contains CI/CD workflow files, Docker configuration, deployment docs, scripts for backup/restore and final deployment checks, migrations folder, generated API docs, and runtime health endpoints.

Known gap: this docs pass did not verify that deployed infrastructure, required secrets, external services, rollback procedures, or production environments are currently operational. Release readiness is not proven by the presence of workflow files.

## Target state

Target state: release readiness should be verified across code, configuration, tenant isolation, Shopify credentials, mobile/dashboard API compatibility, database safety, webhooks, observability, and rollback.

## Implemented vs future checks

Implemented local/repo checks:

- Type checking, Jest tests, coverage, build, Docker image build verification, security scans, dependency reporting, and best-effort Codecov upload are represented in `.github/workflows/ci.yml`.
- Newman API contract validation runs only when the local `tests/postman` collection and environment files exist. Those files are not currently present, so this check is an explicit skip.
- Staging E2E validation in `.github/workflows/cd.yml` runs only when a local `tests/e2e` suite exists. That suite is not currently present, so this check is an explicit skip.
- Runtime health endpoints `/api/health` and `/api/ready` exist in the backend, but external release smoke checks must still be verified against the chosen environment.

Future/operator verification:

- Confirm the authoritative deployment path before release. Current status: not yet decided.
- Confirm whether Railway, AWS/ECS, Docker/manual deployment, or another path owns staging and production.
- Confirm required secrets, registry credentials, domains, TLS, database connectivity, Redis/cache needs, webhooks, rollback procedures, and observability in the target environment.
- Confirm release smoke checks against the deployed URL after an operator has chosen and provisioned the deployment path.

## Deployment path status

- Railway: `railway.json` exists and points Railway at the repository `Dockerfile` with `/api/health` as the health check. This does not prove a live Railway service, environment variables, domains, or production readiness.
- AWS/ECS: `.github/workflows/cd.yml` contains AWS/ECS staging, production, backup, blue-green, CloudWatch, Slack, and rollback steps. This path is unverified and now requires manual `workflow_dispatch` with `deployment_path=aws-ecs-unverified`; it must not be treated as the authoritative path until an operator verifies infrastructure and secrets.
- Docker/manual: `Dockerfile`, Docker Compose files, and `docs/DEPLOYMENT.md` exist. They are deployment documentation/options, not proof of an operational production path.
- Authoritative path: not yet decided.

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

- [ ] Dry run completed (`backfillProductStoreId.ts --dry-run`) and its output reviewed: correct target store, plausible product sample, before-picture "Product counts by store" recorded.
- [ ] Real backfill completed; `db.products.countDocuments({ storeId: { $exists: false } })` returns `0`.
- [ ] Product counts by store verified against the dry-run before-picture (script output or the aggregate in the runbook).
- [ ] Legacy global unique indexes (`shopifyProductId_1`, `handle_1`, `seo.slug_1`) checked and dropped where present (`--drop-legacy-indexes`); `db.products.getIndexes()` shows no single-field unique index on those fields.
- [ ] Store-scoped compound unique indexes verified present (`{ storeId, shopifyProductId }`, `{ storeId, handle }`, `{ storeId, "seo.slug" }`) — the script prints this verdict on every run.

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
