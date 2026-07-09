# Backend Status

Last updated: 2026-07-09.

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
| SaaS tenancy | Partial | Store is the intended tenant boundary. Many models and routes include `storeId`; Product now has `storeId` with store-scoped unique indexes and a documented backfill (`docs/PRODUCT_TENANCY_MIGRATION.md`, issue #65). Legacy local product catalog list/search/featured/category/related/recommendation reads are store-scoped with regression coverage for cross-store isolation (issue #87). The backfill script's dry-run safety, fail-closed store resolution, and index reporting are test-covered and it prints the release-gate verification numbers (per-store counts, index state); Product/customer/order operator release gates and exact Mongo verification commands are in `docs/RELEASE_CHECKLIST.md` (issues #78 and #89). Staging/production execution has NOT been run and is operator work. Ownership policy docs identify routes and middleware patterns that need verification or follow-up. |
| Shopify integration | Partial | Tenant-scoped Storefront helper methods and tests exist for several mobile-facing paths. The legacy first-connected-store Admin helper `getShopifyClient()` is removed (issue #66): runtime sync/inventory/order/admin paths resolve credentials via `getShopifyClientForStore(storeId)` and fail closed without a trusted store context. Customer/order sync record matching is store-scoped (issue #77), but legacy storeless customer/order data backfill remains operator work and per-store sync status tracking remains follow-up work. |
| Store ownership/security | Partial | Customer auth and store admin middleware derive store context from records. Order management and admin storeId-accepting routes now enforce ownership via `requireOwnedStoreParam`/`requireOwnedStoreContext` with explicit super-admin behavior (issue #67). All `adminRoutes` endpoints now require router-level authentication with admin/super-admin authorization (issue #75); no endpoint on that router is public (the unauthenticated health check remains `/api/health`). Admin analytics/dashboard/help-request queries are store-scoped via validated `req.storeId` (issue #79): store admins see only their own store's metrics, and the platform-wide aggregate exists only for super admins who omit the store. `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` documents the policy. |
| Home modules/config | Partial | Current home module models/controllers and response assembly are documented in `docs/HOME_MODULE_CONFIG_AUDIT.md`. Validation and Shopify ID ownership gaps remain. |
| Cart/checkout | Partial | Unified cart, cart, and guest/customer cart flows exist. Local unified-cart product mutations now verify submitted Product IDs belong to the trusted cart store, and guest-to-customer cart merge uses the authenticated customer's store context with regression coverage for cross-store product rejection (issue #88). Checkout strategy is decided and implemented as Shopify-hosted checkout handoff (`POST /api/v1/checkout/handoff`, issue #68): tenant-scoped Storefront `checkoutUrl` with fail-closed store context; legacy native Stripe checkout is gated off in production/SaaS mode. Order webhook reconciliation for handoff checkouts is implemented (issue #76): Shopify order webhooks create/update store-scoped local Orders, match the `CheckoutHandoff`, and attribute customers/guests per `docs/DECISIONS.md`. Any future native checkout tenant-safety remains follow-up work. |
| Orders/customer account | Partial | Customer auth/account, addresses, wishlists, reviews, orders, order management, and customer management code exists. Local customer/order creation now verifies submitted Product IDs against the trusted store before order/inventory mutation, with cross-store rejection tests (issue #88). Tenant ownership and Shopify order sync paths still need careful verification. |
| Dashboard APIs | Partial | Admin, store settings, branding, customer management, order management, email, security, compliance, abandoned cart, notification, and Shopify connection/sync routes exist. Authorization consistency must be verified. |
| Webhooks/sync | Partial | Shopify webhook HMAC verification (raw-body, timing-safe) and shop-domain-to-Store tenant mapping are enforced before webhook handlers run (issue #63); handlers fail closed without a trusted `storeId`. Product and inventory webhook writes and product sync are store-scoped (issue #65). Order webhook writes are store-scoped and reconcile checkout handoffs idempotently (issue #76); Shopify order IDs and order numbers are unique per store, not globally. Customer webhook matching and the `syncCustomers`/`syncOrders` jobs are store-scoped, and sync-created users/orders carry `storeId` (issue #77; legacy-data backfill documented in `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, with release gates in `docs/RELEASE_CHECKLIST.md`). Webhook retry behavior remains follow-up work. |
| Testing/CI | Partial | Jest tests, tenant-scoped Storefront tests, type-check script, build script, and CI workflow exist. Issue #85 makes generated TSOA route registration fail fast at app startup and adds focused coverage proving representative search, product detail, cart, checkout, and favorites spec routes mount. Issue #86 updates CI startup reliability by replacing retired and obsolete action majors, removing unsupported `env` context usage from service image fields, hardening the MongoDB service health check, loading the Docker build before its smoke test, and documenting the required type-check/test/build path. The latest observed main CI run before this fix failed at workflow startup before jobs were scheduled; the next PR/main run must verify the updated workflow in GitHub. Test coverage is not proof that all tenant/security/checkout risks are covered. |
| Release readiness | Partial | CI/CD workflow files and deployment scripts exist. Railway is now the authoritative staging deployment path (issue #97), but no Railway staging service, API URL, environment variables, MongoDB connection, Shopify dev-store credentials, webhook secret, or `/api/health` and `/api/ready` staging evidence has been recorded in this repo. AWS/ECS remains an unverified manual workflow path; Docker/manual remains a fallback/reference option. Production path is still undecided. |

## What appears complete

- Backend context entrypoint and shared SaaS context docs now exist.
- Repository workflow rules and PR template exist.
- Package scripts exist for type checking, tests, builds, OpenAPI generation, and coverage.
- CI workflow is intended to include type checking, tests, coverage, build, Docker build, security scanning, API contract testing, and dependency checks. Issue #86 fixes startup-blocking workflow configuration so GitHub can schedule those jobs again.
- Tests exist for several tenant-scoped Storefront paths, CI workflow script references, and generated TSOA route mounting for representative mobile smoke-test routes.

## What appears partial

- Tenant isolation and store ownership.
- Shopify Storefront/Admin credential scoping.
- Home module validation and Shopify collection ID validation.
- Cart, checkout, and order integration assumptions.
- Dashboard/admin store authorization consistency.
- Webhook and sync production readiness.
- Release and rollback operational verification.

## What is not verified or not started

- Full public SaaS readiness.
- End-to-end first merchant onboarding readiness.
- Automated mobile app build or app-store submission readiness.
- Complete checkout strategy documentation and production validation.
- Complete tenant-safety coverage for every route, job, webhook, and Shopify call.
- A green GitHub CI run on the issue #86 PR or a later main-branch run after the workflow startup fix.
- Provisioned Railway staging URL and recorded `/api/health` plus `/api/ready` evidence.

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
