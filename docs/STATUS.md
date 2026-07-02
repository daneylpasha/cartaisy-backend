# Backend Status

Last updated: 2026-07-02.

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
| SaaS tenancy | Partial | Store is the intended tenant boundary. Many models and routes include `storeId`; Product now has `storeId` with store-scoped unique indexes and a documented backfill (`docs/PRODUCT_TENANCY_MIGRATION.md`, issue #65). Ownership policy docs identify routes and middleware patterns that need verification or follow-up. |
| Shopify integration | Partial | Tenant-scoped Storefront helper methods and tests exist for several mobile-facing paths. The legacy first-connected-store Admin helper `getShopifyClient()` is removed (issue #66): runtime sync/inventory/order/admin paths resolve credentials via `getShopifyClientForStore(storeId)` and fail closed without a trusted store context. Customer/order sync record matching is still global (audit follow-up issue 6), and per-store sync status tracking remains follow-up work. |
| Store ownership/security | Partial | Customer auth and store admin middleware derive store context from records. Order management and admin storeId-accepting routes now enforce ownership via `requireOwnedStoreParam`/`requireOwnedStoreContext` with explicit super-admin behavior (issue #67). Remaining `adminRoutes` endpoints still have auth disabled (separate follow-up), and admin analytics queries remain globally scoped. `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` documents the policy. |
| Home modules/config | Partial | Current home module models/controllers and response assembly are documented in `docs/HOME_MODULE_CONFIG_AUDIT.md`. Validation and Shopify ID ownership gaps remain. |
| Cart/checkout | Partial | Unified cart, cart, checkout-adjacent code, and guest/customer cart flows exist. Checkout strategy and order completion assumptions remain high risk and must be verified before changes. |
| Orders/customer account | Partial | Customer auth/account, addresses, wishlists, reviews, orders, order management, and customer management code exists. Tenant ownership and Shopify order sync paths need careful verification. |
| Dashboard APIs | Partial | Admin, store settings, branding, customer management, order management, email, security, compliance, abandoned cart, notification, and Shopify connection/sync routes exist. Authorization consistency must be verified. |
| Webhooks/sync | Partial | Shopify webhook HMAC verification (raw-body, timing-safe) and shop-domain-to-Store tenant mapping are enforced before webhook handlers run (issue #63); handlers fail closed without a trusted `storeId`. Product and inventory webhook writes and product sync are store-scoped (issue #65). Customer/order webhook writes, retry behavior, and store-scoped customer/order sync still require follow-up work. |
| Testing/CI | Partial | Jest tests, tenant-scoped Storefront tests, type-check script, build script, and CI workflow exist. Test coverage is not proof that all tenant/security/checkout risks are covered. |
| Release readiness | Partial | CI/CD workflow files and deployment scripts exist. Deployed infrastructure, secrets, rollback behavior, and first-merchant readiness must be verified with humans before release. |

## What appears complete

- Backend context entrypoint and shared SaaS context docs now exist.
- Repository workflow rules and PR template exist.
- Package scripts exist for type checking, tests, builds, OpenAPI generation, and coverage.
- CI workflow includes type checking, tests, coverage, build, Docker build, security scanning, API contract testing, and dependency checks.
- Tests exist for several tenant-scoped Storefront paths and CI workflow script references.

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

## Current priority areas

1. Tenant isolation and store ownership correctness.
2. Shopify API credential scoping and removal of unsafe global fallbacks from SaaS runtime paths.
3. Checkout/cart/order strategy documentation and tests before behavior changes.
4. Dashboard/mobile API contract validation.
5. Home module validation and Shopify ID ownership checks.
6. Release readiness and rollback verification.

## Related docs/issues

- GitHub issue: #52.
- `CARTAISY_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/HOME_MODULE_CONFIG_AUDIT.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
