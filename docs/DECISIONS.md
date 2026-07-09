# Backend Decisions

This file records backend-relevant product and architecture decisions that agents should preserve unless a human-approved issue changes them.

Do not assume this exists unless verified in code. These decisions describe intended rules and known policy, not proof that every code path already complies.

## Current state

Current state: decisions are gathered from `AGENTS.md`, shared Cartaisy context docs, backend audits, and current repo conventions.

## Target state

Target state: keep high-risk backend decisions explicit so future issues do not casually change tenant, Shopify, checkout, security, or release assumptions.

## Known gaps

Known gap: exact original decision dates are not known for most entries. Use "Date: unknown / historical" unless a future ADR or issue records a more precise date.

## Decisions

### Store is the tenant boundary

- Date: unknown / historical.
- Decision: `Store` is the backend tenant boundary.
- Reason: Cartaisy is a managed Shopify mobile-app SaaS where each merchant store owns its data, credentials, configuration, customers, and storefront behavior.
- Impact: Tenant-owned backend queries must include `storeId` or use a verified store context.
- Related docs: `docs/cartaisy/TENANCY_MODEL.md`, `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`.

### Tenant-owned queries require store scoping

- Date: unknown / historical.
- Decision: Every tenant-owned backend query must include `storeId` or a trusted store context set by middleware.
- Reason: Query scoping prevents accidental cross-store reads or writes.
- Impact: Agents must verify controller, service, route, webhook, and job paths before changing tenant-owned behavior.
- Related docs: `AGENTS.md`, `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`.

### Store ownership must be proven differently by context

- Date: unknown / historical.
- Decision: Public, customer-authenticated, and admin/dashboard store context require different validation rules.
- Reason: Public storefront reads need store context before authentication, while customer/admin requests must not trust arbitrary caller-supplied store IDs.
- Impact: Use customer records for customer-authenticated store context and admin user/store ownership checks for dashboard contexts.
- Related docs: `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`, `docs/cartaisy/TENANCY_MODEL.md`.

### Shopify private credentials stay server-side

- Date: unknown / historical.
- Decision: Shopify private/Admin credentials must never be exposed to mobile clients, frontend clients, logs, API responses, or generated docs.
- Reason: Merchant credentials are sensitive and tenant-specific.
- Impact: Mobile should consume backend APIs or safe public checkout URLs, not private Shopify tokens.
- Related docs: `AGENTS.md`, `docs/cartaisy/SHOPIFY_API_POLICY.md`.

### Backend Shopify calls use store-scoped credentials

- Date: unknown / historical.
- Decision: Backend Shopify calls for tenant-specific behavior must use credentials for the target store.
- Reason: Global or first-connected-store credentials can leak or corrupt tenant data.
- Impact: Prefer store-scoped Storefront/Admin helpers and treat legacy global helpers as risk areas until verified or refactored.
- Related docs: `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`, `docs/cartaisy/SHOPIFY_API_POLICY.md`.

### Avoid Shopify Plus or Enterprise-only MVP assumptions

- Date: unknown / historical.
- Decision: Do not depend on Shopify Plus, Enterprise-only, or merchant-plan-specific APIs for MVP unless explicitly approved.
- Reason: MVP should work for the intended merchant segment without hidden plan requirements.
- Impact: Any API assumption with plan dependency needs documentation and human approval before implementation.
- Related docs: `docs/cartaisy/SHOPIFY_API_POLICY.md`, `docs/cartaisy/SAAS_SCOPE.md`.

### Checkout, security, and tenant changes require human review

- Date: unknown / historical.
- Decision: High-risk tenancy, security, checkout, payment, auth, authorization, Shopify credential, webhook, migration, and production config changes require focused scope and human review.
- Reason: These areas can affect merchant isolation, customer trust, payments, data integrity, or production operations.
- Impact: Do not bundle high-risk changes into docs-only, refactor, polish, or unrelated issues.
- Related docs: `AGENTS.md`, `docs/cartaisy/DEFINITION_OF_DONE.md`.

### Use audit-first work for unclear high-risk areas

- Date: unknown / historical.
- Decision: When high-risk backend behavior is unclear, document/audit the current state before implementing broad changes.
- Reason: The repo contains mixed current and historical behavior. Audits reduce the chance of changing checkout, Shopify, or tenant behavior accidentally.
- Impact: Prefer focused documentation and follow-up implementation issues for tenant ownership, Shopify API scoping, checkout, webhooks, and migrations.
- Related docs: `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`, `docs/HOME_MODULE_CONFIG_AUDIT.md`, `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`.

### Shopify webhooks require verification and tenant mapping before handlers

- Date: 2026-07-02.
- Decision: Every Shopify webhook must pass raw-body HMAC verification (single app-level `SHOPIFY_WEBHOOK_SECRET`, timing-safe comparison) and resolve its `X-Shopify-Shop-Domain` header to exactly one active connected `Store` before any handler runs. Missing/invalid HMAC returns 401; missing, malformed, unknown, disconnected, inactive, or ambiguous shop domains return 403; handlers fail closed with 401 if the trusted store context is missing.
- Reason: Unverified or unmapped webhooks allow spoofed or cross-tenant payloads to mutate global data.
- Impact: Webhook handlers receive a trusted `storeId` via `getTrustedWebhookStoreId()` from `src/middleware/shopifyWebhookAuth.ts`. New webhook routes must be mounted under `/api/webhooks/shopify` so the raw-body parser and verification chain apply. Store-scoped webhook writes remain follow-up work pending Product tenancy.
- Related docs: `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, `docs/cartaisy/TENANCY_MODEL.md`. GitHub issue: #63.

### Product uniqueness is tenant-scoped

- Date: 2026-07-02.
- Decision: `Product` records carry `storeId`, and Shopify identifier uniqueness (`shopifyProductId`, `handle`, `seo.slug`) is enforced per store via compound unique indexes, not globally. Product persistence paths (sync and webhooks) must set/scope by a trusted `storeId`; `syncProduct()` refuses to upsert without one.
- Reason: Global unique Shopify identifiers block multi-merchant onboarding and can mix or overwrite catalog data across tenants.
- Impact: New product write paths must include `storeId`. Existing single-store deployments must run the backfill and drop legacy global unique indexes per `docs/PRODUCT_TENANCY_MIGRATION.md` before onboarding a second store. `storeId` stays schema-optional until backfill completes everywhere.
- Related docs: `docs/PRODUCT_TENANCY_MIGRATION.md`, `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, `docs/cartaisy/TENANCY_MODEL.md`. GitHub issue: #65.

### No first-connected-store Shopify Admin fallback

- Date: 2026-07-02.
- Decision: The legacy `getShopifyClient()` helper (first connected store) is removed. Every Shopify Admin API call must resolve credentials through `getShopifyClientForStore(storeId)` with a trusted store context (authenticated user's store, order/product record's store, or explicit per-store job iteration), and helpers fail closed when `storeId` is missing.
- Reason: First-connected-store credential selection can run sync, inventory, and order operations against the wrong merchant.
- Impact: New Admin-touching code must accept/derive a trusted `storeId`. Scheduled sync iterates connected stores explicitly and updates only the synced store's `lastSyncAt`. Routes without a store context reject with a controlled error instead of guessing.
- Related docs: `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, `docs/cartaisy/SHOPIFY_API_POLICY.md`, `docs/cartaisy/TENANCY_MODEL.md`. GitHub issue: #66.

### Shopify-hosted checkout is the SaaS checkout v1

- Date: 2026-07-02.
- Decision: The SaaS checkout path is Shopify-hosted checkout handoff: the backend resolves trusted store context (authenticated customer record, or validated public store context for guest carts), reads the cart through that store's own Storefront credentials, and returns the Shopify `checkoutUrl` (`POST /api/v1/checkout/handoff`). Shopify owns payment capture, tax, shipping, discounts, and order creation. The legacy native (Stripe) checkout endpoints fail closed with 403 in production or SaaS mode (`NODE_ENV=production`, `SAAS_MODE`, or `MULTI_TENANT_MODE`), and the unscoped Storefront cart helpers they use (`getCart` without a store client, `updateCartBuyerIdentity`, `applyDiscountCodes`) carry the same interim fail-fast guard.
- Reason: The checkout audit found the native flow uses global Storefront credentials and undefined tenant payment ownership; Shopify-hosted checkout avoids custom payment/tax/shipping risk and keeps merchant credentials server-side.
- Impact: Mobile opens the returned `checkoutUrl` instead of the native multi-step flow for SaaS stores. Non-sensitive handoff metadata (`CheckoutHandoff`: storeId, cart ID, customer/guest correlation) is recorded for future order webhook reconciliation. Native Stripe checkout remains available only in dev/single-store mode until a separate tenant-safety issue redesigns it.
- Related docs: `docs/CHECKOUT_TENANT_SAFETY_AUDIT.md`, `docs/cartaisy/SHOPIFY_API_POLICY.md`. GitHub issue: #68.

### Shopify order webhooks reconcile checkout handoff orders store-scoped

- Date: 2026-07-03.
- Decision: Verified Shopify order webhooks (`orders/create`, `orders/updated`, `orders/paid`) reconcile orders into local, store-scoped `Order` records using only the trusted webhook store context. Attribution rules, in priority order: (1) a matched `CheckoutHandoff` with a `customerId` belonging to the store links `Order.customer`; (2) a matched handoff with a `guestSessionId` creates a guest order carrying that session; (3) with no handoff match, a store-scoped `Customer` email match links `Order.customer`; (4) otherwise the order is stored store-scoped as a guest order with `guestContact` from the payload. Webhook order writes never create dashboard `User` records. Handoffs are matched by cart/checkout token within the trusted store only and marked `reconciled` with the order reference. `shopifyOrderId` and `orderNumber` are unique per store (compound indexes with `storeId`), never globally - every Shopify store numbers orders from #1001, so cross-store collisions are the norm. Duplicate webhook deliveries are idempotent; unknown orders arriving via `orders/updated`/`orders/paid` are stored store-scoped instead of rejected with 404; unprocessable payloads (no order ID or email) are acknowledged with 200 and logged, because they can never succeed on retry.
- Reason: Without reconciliation, a shopper can pay in Shopify while Cartaisy never records the order for customer history, merchant dashboard, or support flows. Global order uniqueness and global email matching would leak or corrupt data across tenants.
- Impact: The order webhook handlers delegate to `src/services/orderReconciliationService.ts`. The legacy global unique indexes `shopifyOrderId_1` and `orderNumber_1` on the orders collection are dropped at startup by `src/utils/dropInvalidIndexes.ts` and replaced by store-scoped compound unique indexes. Refunds/cancellations and customer webhook writes remain follow-up work.
- Related docs: `docs/CHECKOUT_TENANT_SAFETY_AUDIT.md`, `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, `docs/cartaisy/TENANCY_MODEL.md`. GitHub issue: #76.

### Keep backend docs linked to shared Cartaisy context

- Date: 2026-07-01.
- Decision: Backend context docs should link to the shared Cartaisy SaaS context under `docs/cartaisy/README.md`.
- Reason: Shared product and architecture assumptions should stay portable across backend, mobile, and dashboard repos.
- Impact: Backend docs should summarize local details and link to shared policy rather than duplicating large sections.
- Related docs: `CARTAISY_CONTEXT.md`, `docs/cartaisy/README.md`.

### Railway is the authoritative staging deployment path

- Date: 2026-07-09.
- Decision: Use Railway as the authoritative staging deployment path for `cartaisy-backend`.
- Reason: The repository already contains `railway.json` configured to build from the Dockerfile and use `/api/health` as the platform health check. The AWS/ECS workflow and Docker/manual files remain useful references, but their live infrastructure, secrets, domains, rollback behavior, and readiness are unverified.
- Impact: Staging release work should provision and verify Railway first, then record the resulting staging API URL and health/readiness evidence. AWS/ECS must stay behind its explicit unverified/manual path until an operator separately proves that infrastructure. Docker/manual remains a local or fallback deployment option, not the authoritative staging path.
- Operator status: not yet provisioned or verified in this repository. Required follow-up is to create/connect the Railway staging service, attach a dedicated staging MongoDB, set required environment variables by name only, configure Shopify dev-store credentials and webhook secret in Railway, and verify `/api/health` and `/api/ready` against the staging URL.
- Related docs: `railway.json`, `Dockerfile`, `.github/workflows/cd.yml`, `docs/RELEASE_CHECKLIST.md`, `docs/STATUS.md`. GitHub issue: #97.

## Related docs/issues

- GitHub issue: #52.
- `CARTAISY_CONTEXT.md`
- `AGENTS.md`
- `docs/cartaisy/README.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
