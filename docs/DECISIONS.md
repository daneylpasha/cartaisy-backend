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

### Merchant billing is manual for early merchants

- Date: 2026-07-17.
- Decision: Cartaisy charges early merchants manually (setup fee plus monthly subscription handled outside the product). Dashboard/Stripe-driven merchant subscription billing is deferred scope. The existing `Store.plan` field may be set manually by a super admin to record what a merchant pays; nothing may enforce payment in runtime code yet.
- Reason: Billing automation is not required to onboard and serve the first merchants, and building it now would delay the critical path (staging, checkout proof, branded builds).
- Impact: No agent should add merchant billing, payment enforcement, or plan gating without a new human-approved decision. The `plan` enum remains descriptive, not enforced.
- Related docs: `docs/cartaisy/SAAS_SCOPE.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-17.

### Dashboard becomes a pure client of backend APIs

- Date: 2026-07-17.
- Decision: The dashboard's target architecture is UI plus backend API client. The backend is the sole owner of tenant data, Shopify credentials/OAuth, and validation. Dashboard-local MongoDB models for tenant-owned data (Store, User, HomeLayout, home module models, AppConfig) are to be retired incrementally, route by route, starting with Shopify OAuth/token handling moving to the backend. Marketing-only content (blog, newsletter, contact submissions) may stay dashboard-local.
- Reason: The dashboard currently duplicates backend schemas (already drifted) and stores Shopify access tokens in its own database, bypassing every tenancy and credential guardrail enforced in the backend.
- Impact: New dashboard features must call backend APIs, not dashboard Mongoose models. Migration proceeds in small PRs; each dashboard model is deleted when its last consumer is migrated. Dashboard auth aligns to backend-issued JWT/roles, replacing the hard-coded master-admin email list.
- Related docs: `docs/cartaisy/CROSS_REPO_MAP.md`, dashboard repo `docs/ARCHITECTURE.md`, `docs/DASHBOARD_ONBOARDING_FLOW.md`. Decided by Daniyal, 2026-07-17.

### Merchants own their app-store developer accounts

- Date: 2026-07-17.
- Decision: Each merchant enrolls in and owns their own Apple Developer and Google Play developer accounts. Cartaisy performs the setup, provisioning, build, and submission work inside those accounts as part of the paid onboarding/setup service.
- Reason: Publishing many merchant apps from one Cartaisy-owned account conflicts with Apple App Store guidelines for white-label/reseller apps and concentrates platform risk; merchant-owned accounts keep app ownership portable and review risk isolated per merchant.
- Impact: The onboarding runbook must include merchant account enrollment (including Apple enrollment lead time), credential/access handling per merchant, and EAS credential configuration per merchant account. Sales/onboarding promises must account for Apple enrollment delays.
- Related docs: mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md`, `docs/MOBILE_BRANDED_BUILD_CHECKLIST.md`. Decided by Daniyal, 2026-07-17.

### Push notifications are per-merchant Firebase, configured at onboarding

- Date: 2026-07-17.
- Decision: Push notifications are part of the managed service. Each merchant app uses its own Firebase project/app registration. Mobile receives Firebase files at build time (EAS file environment variables). The backend must resolve Firebase Admin credentials per store (target pattern: a per-store resolver mirroring `getShopifyClientForStore(storeId)`, with encrypted per-store credential storage and no global fallback in SaaS mode).
- Reason: A shared Firebase project would mix merchant identity, quotas, and notification data across tenants; per-merchant Firebase keeps push tenant-isolated and makes onboarding a repeatable runbook step.
- Impact: Backend push/notification code paths must accept a trusted store context and fail closed without one. Onboarding runbook gains a Firebase setup step. Existing push diagnostic findings are handled against this target.
- Related docs: `PUSH_NOTIFICATION_DIAGNOSTIC.md` (all repos), `docs/cartaisy/TENANCY_MODEL.md`. Decided by Daniyal, 2026-07-17.

### Runtime branding with build-time brand defaults

- Date: 2026-07-17.
- Decision: Merchant-facing branding uses a two-layer model. Each merchant build ships that merchant's colors and logo as build-time defaults (env-driven `app.config.ts` and build assets), so the first rendered frame is on-brand with no loading flash. Runtime `/store/config` branding fields (primary color, secondary color, logo URL) silently override and are cached on device, so dashboard branding edits propagate without a rebuild. Native identity, icons, splash, Firebase files, and payment capabilities stay build-time per the runtime branding contract.
- Reason: Daniyal requires runtime branding only if it never looks laggy or cheap to the merchant's app users; build-time defaults plus cached runtime override achieves updateability without an unbranded first paint.
- Impact: Implementing the mobile runtime branding contract and the `/store/config` branding extension is approved MVP work. Dashboard exposes only merchant-safe branding fields; native-side changes remain onboarding work.
- Related docs: mobile repo `docs/MOBILE_RUNTIME_BRANDING_CONTRACT.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-17.

### Shopify Partners development store is the test and demo environment

- Date: 2026-07-17.
- Decision: A Cartaisy-controlled Shopify Partners development store, seeded with realistic catalog/collection/customer/order data, is the primary test tenant and the standing sales demo environment. No real merchant exists yet; first-merchant readiness is proven against this store.
- Reason: Every blocked verification chain (staging smoke, checkout handoff, tenant-mismatch tests, branded build demo) needs a reachable Shopify store, and a demo is needed to sell to the first real merchant.
- Impact: Staging provisioning, smoke runbooks, and demo preparation target this store. A second seeded store is added for cross-tenant isolation testing.
- Related docs: `docs/RELEASE_CHECKLIST.md`, `docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-17.

### GitHub Issues are the ticketing system

- Date: 2026-07-17.
- Decision: Scoped work items live as GitHub Issues in the owning repo, written by the orchestrator (planning agent) as self-contained tickets: goal, context files to read, scope, exclusions, verification commands, and definition of done. Implementing agents read the ticket (`gh issue view N`), deliver one small PR referencing "Closes #N", and must stop and report instead of expanding scope. Root-level `issue-*.md` files are legacy; completed ones are removed (git history preserves them) and open ones migrate to GitHub Issues.
- Reason: Committed ticket files accumulate as clutter and lose open/closed state; GitHub Issues provide lifecycle, PR linkage, and are readable by any agent tool.
- Impact: Permanent memory stays in repo docs (`ROADMAP.md`, `DECISIONS.md`, `STATUS.md`, context packs), updated in place. A housekeeping pass audits and removes completed root-level issue files in all three repos.
- Related docs: `docs/cartaisy/AGENT_WORKFLOW.md`, `docs/cartaisy/ISSUE_PRIORITY_RULES.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-17.

### Strategy decisions are Daniyal's; operational decisions are delegated

- Date: 2026-07-17.
- Decision: Business-strategy decisions — pricing, product scope, target market, merchant-facing behavior/features, partnerships, positioning — are made only in conversation with Daniyal and recorded in this file before any ticket exists. The orchestrator may propose options with trade-offs but never decides or tickets strategy unilaterally. Operational decisions — sequencing, ticket slicing, model routing, review verdicts — are delegated to the orchestrator within the approved roadmap.
- Reason: Keeps ownership of the business unambiguous as agent autonomy grows: agents can move fast inside the approved plan without strategy drifting into tickets nobody signed off on.
- Impact: A ticket implying a strategy change is invalid until a matching entry exists here; the orchestrator flags the needed decision in its summary instead of cutting the ticket.
- Related docs: `docs/cartaisy/DEV_PLAYBOOK.md`, `docs/cartaisy/ROADMAP.md`, `docs/cartaisy/SAAS_SCOPE.md`. Decided by Daniyal, 2026-07-17.

### Merchant EAS/Expo projects live under a Cartaisy-managed Expo organization

- Date: 2026-07-23.
- Decision: Merchant mobile builds run from a Cartaisy-managed Expo/EAS organization, with one EAS project per merchant app inside it. Merchant-owned Expo accounts are a documented, separately priced exception for merchants who explicitly require full infrastructure ownership — never the default. This resolves the open flag in the mobile repo's `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md` (Steps 2–3).
- Reason: Expo/EAS is build machinery, not app identity. Identity layers (Apple Developer, Google Play, Shopify, Stripe) remain merchant-owned per the 2026-07-17 decision, which is where Apple's white-label ownership rules and portability actually apply. A Cartaisy-managed org removes a confusing merchant-side signup from onboarding, avoids per-merchant credential/invite churn, keeps EAS billing on one Cartaisy subscription, and lets provisioning automation run with a single org-scoped token instead of per-merchant secrets.
- Impact: Store-facing provisioning automation (EAS project bootstrap, Firebase Management API provisioning, and the single "provision merchant" pipeline in the runbook's automation list) is now unblocked and may be ticketed. iOS signing continues to resolve against the merchant's own Apple team, and Android upload keystores remain exportable from EAS; the merchant offboarding path (hand over keystore + bundle IDs) must be written into the onboarding runbook and merchant agreement. The Cartaisy Expo org requires hardware-key 2FA and scoped org tokens for automation.
- Related docs: mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md`, `docs/MOBILE_BRANDED_BUILD_CHECKLIST.md`, `docs/cartaisy/ROADMAP.md` (Phase 2). Decided by Daniyal, 2026-07-23.

### Legacy CLIENT-ONBOARDING.md is superseded by the SaaS onboarding flow

- Date: 2026-07-23.
- Decision: `docs/CLIENT-ONBOARDING.md` describes the retired pre-SaaS model (per-client backend deployments, manually created Shopify private apps, hand-entered Admin tokens, per-client cloud provider choices) and is superseded. The current onboarding sources of truth are: dashboard repo `docs/DASHBOARD_ONBOARDING_FLOW.md` (merchant-facing flow), mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md` (Cartaisy-side provisioning), and `docs/cartaisy/ROADMAP.md` Phase 6 (onboarding productization). The legacy doc must be rewritten to match the current model or reduced to a pointer at those docs.
- Reason: The legacy doc contradicts recorded decisions (backend-owned Shopify OAuth, multi-tenant single backend, server-side credential handling) and is a live hazard: an agent or future hire following it would onboard a merchant against the wrong architecture.
- Impact: No agent may follow `docs/CLIENT-ONBOARDING.md` as-is. A docs-only ticket rewrites or stubs it; until that lands, this entry is the authoritative warning. The rewrite must not introduce new onboarding behavior — it documents the flow already decided here.
- Related docs: dashboard repo `docs/DASHBOARD_ONBOARDING_FLOW.md`, mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-23.

## Related docs/issues

- GitHub issue: #52.
- `CARTAISY_CONTEXT.md`
- `AGENTS.md`
- `docs/cartaisy/README.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
