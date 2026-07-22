# Backend Status

Last updated: 2026-07-22.

This file is a human/agent-maintained snapshot, not an automatically guaranteed source of truth. Verify current behavior in code, tests, CI, and deployed environments before making implementation decisions.

Do not assume this exists unless verified in code.

## Current state

Current state: the backend has a broad Express/Mongoose implementation with mobile and dashboard/admin API areas, Shopify integration code, tenant-related middleware, docs/audits, tests, CI workflow files, and deployment workflow files.

## Target state

Target state: use this file to orient backend work quickly, then inspect the linked docs and source code before changing behavior.

## Known gaps

Known gap: status categories below are based on repo inspection and existing docs, not an exhaustive runtime audit.

| Area | Status | Notes |
| --- | --- | --- |
| SaaS tenancy | Partial | Store is the intended tenant boundary. Many models and routes include `storeId`; Product now has `storeId` with store-scoped unique indexes and a documented backfill (`docs/PRODUCT_TENANCY_MIGRATION.md`, issue #65). Legacy local product catalog list/search/featured/category/related/recommendation reads are store-scoped with regression coverage for cross-store isolation (issue #87). The backfill script's dry-run safety, fail-closed store resolution, and index reporting are test-covered and it prints the release-gate verification numbers (per-store counts, index state); Product/customer/order operator release gates and exact Mongo verification commands are in `docs/RELEASE_CHECKLIST.md` (issues #78 and #89). Issue #108 provided no operator staging evidence in the issue body or comments, so staging/production execution remains pending operator work; no staging backup, storeless Product/User/Order counts, product index verification, legacy global unique index status, or rollback notes have been recorded. Ownership policy docs identify routes and middleware patterns that need verification or follow-up. |
| Shopify integration | Partial | Tenant-scoped Storefront helper methods and tests exist for several mobile-facing paths. The legacy first-connected-store Admin helper `getShopifyClient()` is removed (issue #66): runtime sync/inventory/order/admin paths resolve credentials via `getShopifyClientForStore(storeId)` and fail closed without a trusted store context. Customer/order sync record matching is store-scoped (issue #77), but legacy storeless customer/order data backfill remains operator work. Issue #110 adds in-process per-store sync status for manual/scheduled sync results and admin status/overview reads; durable sync status storage, distributed locking, and worker redesign remain future work. Issue #124 provisions the per-store Storefront API token: `createStorefrontAccessToken(storeId)` calls the Admin GraphQL `storefrontAccessTokenCreate` mutation with the store's own connected Admin credentials and persists the token to `Store.shopify.storefrontAccessToken` (that store only, no global env fallback). It is exposed as store-admin `POST /api/v1/shopify/storefront-token` (admin auth + `requireOwnedStoreContext()`) and invoked best-effort at the end of the OAuth callback (failure logs a warning and leaves the store Admin-connected). This closes the issue #116 gap where `getStorefrontClientForStore()` failed closed for Admin-connected stores; running the endpoint once against the staging store remains operator follow-up. |
| Store ownership/security | Partial | Customer auth and store admin middleware derive store context from records. Order management and admin storeId-accepting routes now enforce ownership via `requireOwnedStoreParam`/`requireOwnedStoreContext` with explicit super-admin behavior (issue #67). All `adminRoutes` endpoints now require router-level authentication with admin/super-admin authorization (issue #75); no endpoint on that router is public (the unauthenticated health check remains `/api/health`). Admin analytics/dashboard/help-request queries are store-scoped via validated `req.storeId` (issue #79): store admins see only their own store's metrics, and the platform-wide aggregate exists only for super admins who omit the store. Dashboard/admin route ownership coverage was audited route-by-route for issue #101; the audit found and fixed unscoped Shopify admin tooling reads/actions under `/api/v1/shopify`, which now require admin/super-admin role plus `requireOwnedStoreContext()` and scope product/order/inventory data to the validated store. Issue #110 scopes Shopify sync status and overview sync data to the validated store, keeps admin platform sync status explicit for super admins who omit a store, and returns controlled not-found responses for cross-store inventory sync product IDs. `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` documents the policy and audit findings. |
| Home modules/config | Partial | Current home module models/controllers and response assembly are documented in `docs/HOME_MODULE_CONFIG_AUDIT.md`. Home module create/update and activation paths now validate configured Shopify collection IDs through the owning store's Storefront credentials and reject invalid or cross-store IDs with controlled 400 responses (issue #100). Remaining gaps include broader payload validation, dashboard picker ergonomics, image URL validation, and position/order normalization. |
| Cart/checkout | Partial | Unified cart, cart, and guest/customer cart flows exist. Local unified-cart product mutations now verify submitted Product IDs belong to the trusted cart store, and guest-to-customer cart merge uses the authenticated customer's store context with regression coverage for cross-store product rejection (issue #88). Checkout strategy is decided and implemented as Shopify-hosted checkout handoff (`POST /api/v1/checkout/handoff`, issue #68): tenant-scoped Storefront `checkoutUrl` with fail-closed store context; legacy native Stripe checkout is gated off in production/SaaS mode. Order webhook reconciliation for handoff checkouts is implemented (issue #76): Shopify order webhooks create/update store-scoped local Orders, match the `CheckoutHandoff`, and attribute customers/guests per `docs/DECISIONS.md`. Any future native checkout tenant-safety remains follow-up work. |
| Orders/customer account | Partial | Customer auth/account, addresses, wishlists, reviews, orders, order management, and customer management code exists. Local customer/order creation now verifies submitted Product IDs against the trusted store before order/inventory mutation, with cross-store rejection tests (issue #88). Tenant ownership and Shopify order sync paths still need careful verification. |
| Dashboard APIs | Partial | Admin, analytics, store settings, branding, customer management, order management, email, security, compliance, abandoned cart, notification, home module, Shopify OAuth, and Shopify admin tooling routes exist. Issue #101 verified the dashboard/admin ownership patterns: store-specific `:storeId` routes use `requireOwnedStoreParam()`, aggregate dashboard/analytics routes use `requireOwnedStoreContext({ required: false })` with explicit super-admin platform-wide behavior, and Shopify admin tooling now scopes overview/sync/product/inventory reads/actions to the validated admin store context. Public health, storefront/customer-entry, analytics event, OAuth callback, and webhook surfaces remain intentionally separate from dashboard auth. |
| Webhooks/sync | Partial | Shopify webhook HMAC verification (raw-body, timing-safe) and shop-domain-to-Store tenant mapping are enforced before webhook handlers run (issue #63); handlers fail closed without a trusted `storeId`. Product and inventory webhook writes and product sync are store-scoped (issue #65). Order webhook writes are store-scoped and reconcile checkout handoffs idempotently (issue #76); Shopify order IDs and order numbers are unique per store, not globally. Webhook-sourced order address validation is relaxed so any address Shopify accepted is storable: `province`, `zip`, and the strict phone format are optional for reconciliation-built orders (empty/missing values persist as absent, logged as a warning), while locally-created orders keep the strict rules (issue #126). Customer webhook matching and the `syncCustomers`/`syncOrders` jobs are store-scoped, and sync-created users/orders carry `storeId` (issue #77; legacy-data backfill documented in `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, with release gates in `docs/RELEASE_CHECKLIST.md`). Webhook retry behavior remains follow-up work. |
| Testing/CI | Partial | Jest tests, tenant-scoped Storefront tests, type-check script, build script, and CI workflow exist. Issue #85 makes generated TSOA route registration fail fast at app startup and adds focused coverage proving representative search, product detail, cart, checkout, and favorites spec routes mount. Issue #86 updates CI startup reliability by replacing retired and obsolete action majors, removing unsupported `env` context usage from service image fields, hardening the MongoDB service health check, loading the Docker build before its smoke test, and documenting the required type-check/test/build path. The latest observed main CI run before this fix failed at workflow startup before jobs were scheduled; the next PR/main run must verify the updated workflow in GitHub. CI verification run 2026-07-17 (issue #117, PR #118): green — all jobs scheduled and passed (type-check, tests, coverage, build, Docker build, security, API contract, dependency check). Run: https://github.com/daneylpasha/cartaisy-backend/actions/runs/29571792766. Test coverage is not proof that all tenant/security/checkout risks are covered. |
| Release readiness | Partial | CI/CD workflow files and deployment scripts exist. Railway is now the authoritative staging deployment path (issue #97). Issue #116 recorded and verified a live Railway staging service, API URL, core environment variables, dedicated staging MongoDB connection, a staging `Store` record, and passing `/api/health`/`/api/ready` responses — see the sanitized evidence record in `docs/RELEASE_CHECKLIST.md`. Shopify dev-store credentials were also configured and the OAuth connection verified live in issue #116 (`shopify.isConnected: true` on the staging `Store`); `SHOPIFY_WEBHOOK_SECRET` is present but live webhook delivery was not exercised. Staging tenancy backfill release gates for Product/User/Order remain blocked on operator execution and sanitized evidence (issue #108). AWS/ECS remains an unverified manual workflow path; Docker/manual remains a fallback/reference option. Production path is still undecided. |

First-merchant checkout smoke status (issues #99 and #109): a repeatable
Shopify-hosted checkout/order webhook smoke runbook exists at
`docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md`. Issue #109
attempted to execute the runbook but was blocked before checkout handoff. As of
issue #116, the previously-missing prerequisites are now recorded: a verified
Railway staging URL, `/api/health`/`/api/ready` output, a staging `Store`
record, and a live Shopify OAuth connection (shop domain, scopes,
`shopify.isConnected: true`) — see `docs/RELEASE_CHECKLIST.md`. Still not
exercised: live Shopify webhook HMAC delivery to the staging backend, a test
cart/checkout, and operator approval for live checkout actions. Successful
`checkoutUrl` generation and order webhook reconciliation remain unverified
until an operator runs the smoke test end-to-end and records a real run.

## What appears complete

- Backend context entrypoint and shared SaaS context docs now exist.
- Repository workflow rules and PR template exist.
- Package scripts exist for type checking, tests, builds, OpenAPI generation, and coverage.
- CI workflow is intended to include type checking, tests, coverage, build, Docker build, security scanning, API contract testing, and dependency checks. Issue #86 fixes startup-blocking workflow configuration so GitHub can schedule those jobs again.
- Tests exist for several tenant-scoped Storefront paths, CI workflow script references, and generated TSOA route mounting for representative mobile smoke-test routes.
- Railway staging service, environment variables, dedicated staging MongoDB, staging `Store` record, `/api/health`/`/api/ready` responses, and a live Shopify OAuth connection are recorded and verified for issue #116 (see `docs/RELEASE_CHECKLIST.md`).

## What appears partial

- Tenant isolation and store ownership.
- Shopify Storefront/Admin credential scoping.
- Broader home module payload validation beyond Shopify collection ID ownership.
- Cart, checkout, and order integration assumptions.
- Dashboard/admin store authorization consistency.
- Webhook and sync production readiness.
- Release and rollback operational verification.

## What is not verified or not started

- Full public SaaS readiness.
- End-to-end first merchant onboarding readiness.
- Automated mobile app build or app-store submission readiness.
- Complete checkout strategy documentation and production validation.
- First-merchant Shopify-hosted checkout/order webhook smoke execution against
  an approved development or generated-test-data store. Issue #109 records a
  blocked attempt, not a successful smoke run.
- Complete tenant-safety coverage for every route, job, webhook, and Shopify call.
- A green GitHub CI run on the issue #86 PR or a later main-branch run after the workflow startup fix.
- Live Shopify webhook HMAC delivery against the staging backend, and the full first-merchant Shopify-hosted checkout/order webhook smoke run (see issues #99/#109 status above) — the OAuth connection itself is verified, but webhook delivery and checkout handoff are not.
- Staging tenancy backfill release-gate evidence for Product/User/Order counts,
  Product compound indexes, legacy global unique index absence, backup, and
  rollback notes.

## Current priority areas

1. Tenant isolation and store ownership correctness.
2. Shopify API credential scoping and removal of unsafe global fallbacks from SaaS runtime paths.
3. Checkout/cart/order strategy documentation and tests before behavior changes.
4. Dashboard/mobile API contract validation.
5. Home module validation and Shopify ID ownership checks.
6. Release readiness and rollback verification.
7. Railway staging provisioning and smoke-test evidence.

## Related docs/issues

- GitHub issue: #52.
- `CARTAISY_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/HOME_MODULE_CONFIG_AUDIT.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
