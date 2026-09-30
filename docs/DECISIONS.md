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

### Shopify owns settlement; Cartaisy does not charge

- Date: 2026-09-28.
- Decision: The only SaaS/production settlement entry is `POST /api/v1/checkout/handoff`, which returns a Shopify Storefront `checkoutUrl`. The cart id must be a Storefront cart GID (`gid://shopify/Cart/<token>` with an optional `?key=`). Cartaisy-only ids are rejected before any Storefront call. Legacy native checkout, Stripe payment-intent create/confirm/refund, simulated `processPayment` / `createMobileOrder`, and mobile/local order-create handlers (`POST /api/v1/customer/orders` and the unrouted legacy `createOrder`) fail closed with 403 when `NODE_ENV=production`, `SAAS_MODE`, or `MULTI_TENANT_MODE` is set. There is no env flag that turns Stripe settlement back on in those modes. Saved-card vaulting (`/payment-methods`) does not capture payment and is unchanged. Webhook order ingest is unchanged.
- Reason: Shopify owns payment capture. A Cartaisy order or Stripe PaymentIntent would settle outside the merchant's Shopify checkout.
- Impact: Mobile SaaS completes checkout by opening the handoff URL. Local order creation remains available only for non-production, non-SaaS development and tests.
- Related docs: `docs/CHECKOUT_TENANT_SAFETY_AUDIT.md`. GitHub issue: #181.

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
- Reaffirmed 2026-09-23: invite-only v1 onboarding does not add billing. See "Cartaisy v1 merchant onboarding is locked".
- Related docs: `docs/cartaisy/SAAS_SCOPE.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-17.

### Dashboard becomes a pure client of backend APIs

- Date: 2026-07-17.
- Decision: The dashboard's target architecture is UI plus backend API client. The backend is the sole owner of tenant data, Shopify credentials/OAuth, and validation. Dashboard-local MongoDB models for tenant-owned data (Store, User, HomeLayout, home module models, AppConfig) are to be retired incrementally, route by route, starting with Shopify OAuth/token handling moving to the backend. Marketing-only content (blog, newsletter, contact submissions) may stay dashboard-local.
- Reason: The dashboard currently duplicates backend schemas (already drifted) and stores Shopify access tokens in its own database, bypassing every tenancy and credential guardrail enforced in the backend.
- Impact: New dashboard features must call backend APIs, not dashboard Mongoose models. Migration proceeds in small PRs; each dashboard model is deleted when its last consumer is migrated. Dashboard auth aligns to backend-issued JWT/roles, replacing the hard-coded master-admin email list.
- Locked further 2026-09-23: new connects must not persist `shopify.accessToken` in the dashboard database. That slice is "Backend is the sole owner of Shopify OAuth tokens for new connects" and "Cartaisy v1 merchant onboarding is locked". Historical dashboard tokens are still unmigrated. The rest of this pure-client migration is unchanged.
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
- Clarified 2026-09-23: merchants choose splash and icon during onboarding. Those assets stay build-time. They are not part of the runtime `/store/config` override. See "Cartaisy v1 merchant onboarding is locked".
- Clarified 2026-09-28: the chosen icon and splash URLs are stored on `Store.branding` (issue #173) so a dashboard reload does not depend on a dashboard-only copy. See "App icon and splash live on store branding".
- Clarified 2026-09-28: public `GET /api/v1/store/config` returns those stored URLs as `iconUrl` and `splashUrl`, with read aliases `appIconUrl` and `splashImageUrl` (issue #174). The same omit-invalid rules as `logoUrl` apply, including token-shaped values. Native icon files, splash rendering, and Firebase files stay build-time. Dashboard UI is unchanged.
- Clarified 2026-09-29: issue #200. `PATCH /api/v1/admin/stores/:storeId/branding` accepts JSON `null` for `primaryColor` and/or `secondaryColor` and removes that stored override. Omitting the key leaves it unchanged. A value that is not a hex color is still rejected. Admin `GET` and the PATCH response return `null` when that color is unset, so the dashboard can show the platform default again. Public `GET /api/v1/store/config` still omits an unset color, the same as a color that was never stored, so the app uses its bundled default. `primaryColor` has no schema path default, so a later save does not write `#FF6B6B` back. New stores may still be created with the branding subdocument's initial `#FF6B6B` until a merchant clears it.
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
- Superseded for v1 onboarding (2026-09-23): the sentence above does not authorize full self-serve EAS inside the merchant onboarding flow. v1 "Build my app" is a tracked request. Expo organization ownership in this entry is unchanged. See "Cartaisy v1 merchant onboarding is locked".
- Related docs: mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md`, `docs/MOBILE_BRANDED_BUILD_CHECKLIST.md`, `docs/cartaisy/ROADMAP.md` (Phase 2). Decided by Daniyal, 2026-07-23.

### Legacy CLIENT-ONBOARDING.md is superseded by the SaaS onboarding flow

- Date: 2026-07-23.
- Decision: `docs/CLIENT-ONBOARDING.md` describes the retired pre-SaaS model (per-client backend deployments, manually created Shopify private apps, hand-entered Admin tokens, per-client cloud provider choices) and is superseded. The current onboarding sources of truth are: dashboard repo `docs/DASHBOARD_ONBOARDING_FLOW.md` (merchant-facing flow), mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md` (Cartaisy-side provisioning), `docs/cartaisy/ROADMAP.md` Phase 6 (onboarding productization), and the 2026-09-23 entry "Cartaisy v1 merchant onboarding is locked". The legacy doc must be rewritten to match the current model or reduced to a pointer at those docs.
- Superseded step order (2026-09-23): where an older Phase 6 checklist or the dashboard onboarding flow doc requires a home-module builder before preview, that order is superseded by the locked order in "Cartaisy v1 merchant onboarding is locked". `docs/CLIENT-ONBOARDING.md` stays retired.
- Reason: The legacy doc contradicts recorded decisions (backend-owned Shopify OAuth, multi-tenant single backend, server-side credential handling) and is a live hazard: an agent or future hire following it would onboard a merchant against the wrong architecture.
- Impact: No agent may follow `docs/CLIENT-ONBOARDING.md` as-is. A docs-only ticket rewrites or stubs it; until that lands, this entry is the authoritative warning. The rewrite must not introduce new onboarding behavior — it documents the flow already decided here.
- Related docs: dashboard repo `docs/DASHBOARD_ONBOARDING_FLOW.md`, mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md`, `docs/cartaisy/ROADMAP.md`. Decided by Daniyal, 2026-07-23.

### Firebase projects are per-merchant and Cartaisy-managed

- Date: 2026-07-31.
- Decision: Reaffirms the 2026-07-17 per-merchant Firebase decision and settles its management model. Every merchant app gets one dedicated Firebase project (never an app entry inside a shared Cartaisy project), and all merchant Firebase projects are created and administered centrally under Cartaisy's Google account — mirroring the Cartaisy-managed Expo organization model — with a standard naming convention (e.g. `cartaisy-<merchant-slug>`). Merchants never need their own Firebase billing account: push (FCM), Analytics, and Crashlytics run on the free Spark tier. A merchant who asks for visibility receives read-only IAM access to their own project only. Offboarding transfers ownership of the merchant's Firebase project to the merchant's Google account, alongside the EAS keystore handover.
- Reason: Firebase IAM is project-scoped, so a shared project cannot grant a merchant access to only their app's data and would mix push tokens, analytics audiences, and crash data across tenants, contradicting the tenancy model. Per-merchant projects give a blast radius of one merchant, clean churn (delete one project deletes that merchant's data), and clean takeover (ownership transfer). The scale cost is Google Cloud's project-creation quota (defaults in the dozens; raised by routine request) — a paperwork step, not an architecture limit — and the runbook's planned Firebase Management API automation removes the per-project manual overhead.
- Impact: Sample and real merchants alike get a dedicated project (the Acme Outfitters throwaway project was policy-compliant). Provisioning automation targets the Firebase Management API under Cartaisy's account. Backend Phase 5 per-store Firebase Admin credential resolution maps one-to-one to per-merchant projects. Request a GCP project-quota increase before onboarding volume requires it. The mobile provisioning runbook's Step 4 gains the management-model, access-grant, and offboarding notes (follow-up docs ticket in the mobile repo).
- Related docs: mobile repo `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md` (Step 4), `docs/cartaisy/ROADMAP.md` (Phase 5), `docs/cartaisy/TENANCY_MODEL.md`. Decided by Daniyal, 2026-07-31.

### `no-console` lint rule stays at `warn`, not escalated to a hard CI gate

- Date: 2026-08-03.
- Decision: `no-console` stays at `warn` in `eslint.config.mjs`, not escalated to a hard CI-blocking error.
- Reason: 1,479 existing warnings across the backend were judged not worth blocking work over at this time.
- Impact: No CI behavior change today. Revisit if real console output starts leaking into production logs or becomes a recurring complaint.
- Related docs: `eslint.config.mjs`. Decided by Daniyal, 2026-08-03.

### Backend is the sole owner of Shopify OAuth tokens for new connects

- Date: 2026-09-23.
- Decision: New merchant Shopify connects complete only on this backend. The Admin access token is encrypted on `Store.shopify.accessToken` for that `storeId` and is never returned to the dashboard or mobile app. The dashboard starts connect, reads status, disconnects, and triggers sync through the backend APIs in `docs/cartaisy/SHOPIFY_API_POLICY.md`. Disconnect revokes the token at Shopify, then clears it, and connection status becomes `disconnected`. A shop domain can be connected to only one store. Webhook HMAC and shop-to-Store mapping stay store-scoped.
- Reason: Dual token ownership (dashboard Mongo plus backend) causes bugs and blocks simple onboarding. Phase 4 starts by making the backend the source of truth for new connects (issue #153, parent epic #152).
- Impact: Dashboard work for this flow must not persist `shopify.accessToken`. Tokens already stored in the dashboard database are not migrated here; that needs a later migration if any historical install still depends on the dashboard copy. Durable catalog sync status and build eligibility landed in issue #154 (PR #158). The full onboarding lock is the 2026-09-23 entry below (issue #156). Partner app configuration is `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_REDIRECT_URI`, and `SHOPIFY_SCOPES` (with `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` as fallbacks for the id and secret only).
- Related docs: `docs/cartaisy/SHOPIFY_API_POLICY.md`, `docs/STATUS.md`, `docs/cartaisy/ROADMAP.md` (Phase 4). GitHub issue: #153. Pull request: https://github.com/daneylpasha/cartaisy-backend/pull/157.

### Cartaisy v1 merchant onboarding is locked

- Date: 2026-09-23.
- Decision: v1 merchant onboarding is locked. Do not reopen these rules unless a human-approved issue records a replacement here first. Parent epic: [#152](https://github.com/daneylpasha/cartaisy-backend/issues/152). This entry is the product lock. Implementation status lives in `docs/STATUS.md`.

  1. **Backend owns Shopify OAuth tokens for new connects.** The dashboard never stores `shopify.accessToken` for the new flow. The dashboard contract is connect, status, disconnect, and sync (`docs/cartaisy/SHOPIFY_API_POLICY.md`). Issue #153 landed in [PR #157](https://github.com/daneylpasha/cartaisy-backend/pull/157). Dashboard UI landed in [cartaisy-dashboard#19](https://github.com/daneylpasha/cartaisy-dashboard/pull/19) (closes #15).
  2. **Onboarding order.** Invite-only signup, then Connect Shopify first, then branding (most fields editable), then a smart-default home preview, then tracked "Build my app". v1 has no required home-module builder. Full self-serve EAS is outside epic #152. Wizard landed in [cartaisy-dashboard#19](https://github.com/daneylpasha/cartaisy-dashboard/pull/19) (closes #16). Smart default home: [Cartaisy#121](https://github.com/daneylpasha/Cartaisy/issues/121). Clarified 2026-09-28: issue #182 may start an EAS build on Cartaisy's Expo account when a store admin creates a build request. That does not add store-owner Apple/Google connect or EAS Submit. See "Build requests can start EAS builds on Cartaisy's Expo account".
  3. **Shopify stays the source of truth for locked fields.** Locked: shop domain / myshopify URL, Shopify shop id, products, orders, and collection contents. Editable: app display name, logo, brand colors, splash and icon, which collections to feature on home, and home module layout later. Native splash and icon files stay build-time under the 2026-07-17 runtime branding decision. Their stored URLs are also returned on public `GET /api/v1/store/config` (issue #174). Primary color, secondary color, logo, and those URLs are runtime-readable.
  4. **Sync UX.** The first catalog sync starts automatically after Shopify connect (issue #166). The primary action remains "Sync again", with the quiet auto-retry already specified in `docs/cartaisy/SHOPIFY_API_POLICY.md`. Branding may continue while sync has not succeeded, and the UI shows a warning. "Build my app" stays blocked until catalog sync has succeeded for the same connected shop (`Store.catalogSync` and `assertBuildEligible`). Issue #154 landed in [PR #158](https://github.com/daneylpasha/cartaisy-backend/pull/158).
  5. **Platforms.** Android and iOS are both in v1. Android may ship first. Each platform has its own status. Build request API: issue #155. Dashboard status UI: [cartaisy-dashboard#17](https://github.com/daneylpasha/cartaisy-dashboard/issues/17).
  6. **Premium white-label bar.** Launch waits until both the dashboard and the shopper app feel premium. Dashboard chrome stays neutral. The shopper template follows the merchant brand. Shopper pass: [Cartaisy#122](https://github.com/daneylpasha/Cartaisy/issues/122).
  7. **Invite-only. Manual billing unchanged.** Public open signup stays out of v1. Merchant billing stays the 2026-07-17 manual decision. No payment enforcement and no plan gating. Google sign-in (2026-09-24, "Google sign-in is an alternative merchant credential") does not open signup. It only signs in an existing dashboard user by verified email.

- Reason: Daniyal locked these rules on 2026-09-23 so later tickets do not put tokens back in the dashboard, require a home builder during onboarding, automate EAS in v1, open public signup, or add billing code.
- Impact: A ticket that changes any rule above is invalid until this entry changes. Epic #152 also leaves Phase 5 per-merchant Firebase push on the existing roadmap unless a later decision pulls it into onboarding. Docs that still require a home-modules step during onboarding, that let the dashboard store `shopify.accessToken` for new connects, or that treat automated EAS or app-store submission as the v1 build are superseded. See the notes on the older entries and `docs/cartaisy/ROADMAP.md` Phase 4 and Phase 6.
- Related docs: `docs/cartaisy/ROADMAP.md`, `docs/STATUS.md`, `docs/cartaisy/SHOPIFY_API_POLICY.md`. GitHub: epic #152; children #153, #154, #155, #156; dashboard #15, #16, #17; mobile #121, #122. Decided by Daniyal, 2026-09-23.

### Google sign-in is an alternative merchant credential

- Date: 2026-09-24.
- Decision: Invite-only merchant signup stays. Google is an alternative credential for an existing merchant dashboard user, matched by verified email. It does not create a Cartaisy account, does not open public signup, and does not replace the invite. `POST /api/v1/auth/google` accepts a Google Identity Services ID token (`idToken`). The backend verifies it with audience `GOOGLE_CLIENT_ID` (one ID, or a comma-separated list) and requires `email_verified === true`. Only dashboard roles may receive a session: `super_admin`, `admin`, and `moderator`. Shopper roles in the same `users` collection (`customer`, `premium_customer`, including Shopify-imported shoppers) never receive a dashboard session from this route. A successful response is the same shape as `POST /api/v1/auth/login`.
- Reason: Merchants should not need a separate Cartaisy password. Account creation stays invite-only, so a Google email with no dashboard user is not a signup.
- Impact: Railway production and staging must set `GOOGLE_CLIENT_ID` to the dashboard's Google OAuth web client ID. The value is an audience, not a secret. `GOOGLE_CLIENT_SECRET` is not used for this ID-token check. If `GOOGLE_CLIENT_ID` is unset, the process still boots and the route returns `503` with `GOOGLE_NOT_CONFIGURED`. Stable error codes: `GOOGLE_TOKEN_INVALID` (401), `NO_MERCHANT_ACCOUNT` (404), `ACCOUNT_INACTIVE` (403), `AMBIGUOUS_MERCHANT_ACCOUNT` (409) when more than one dashboard user shares that email. `googleSub` and `authProvider` may be stored for audit. Password login behavior is unchanged. An invited user who is still `isActive: false` cannot finish activation through Google in this version. For a non-Gmail address, `email_verified` only proves that Google had verified that address; invite-only signup is what keeps an unknown address from becoming a merchant.
- Related docs: `.env.example`, `docs/STATUS.md`, `docs/cartaisy/CROSS_REPO_MAP.md`, `docs/cartaisy/ROADMAP.md`, `docs/cartaisy/SAAS_SCOPE.md`.

### App icon and splash live on store branding

- Date: 2026-09-28.
- Decision: App icon and splash are first-class fields on `Store.branding`. An authenticated store admin uploads them with `POST /api/v1/admin/stores/:storeId/branding/icon` and `POST /api/v1/admin/stores/:storeId/branding/splash` (multipart field `image`, same auth, store ownership, and Cloudinary path as the logo). The stored fields are `iconUrl` and `splashUrl`. `GET` and `PATCH /api/v1/admin/stores/:storeId/branding` return those fields beside `logoUrl`, `primaryColor`, and `secondaryColor`, with read aliases `appIconUrl` and `splashImageUrl`. `PATCH` does not accept image URLs. Only an absolute `https` URL that is not token-shaped is stored. Token-shaped values (`shpat_`, `shpss_`, `shpca_`, `shpct_`, `shpua_`, `access_token`, bearer) are dropped on read and are never written to logs or API responses. An already-stored absolute `http` URL is still returned; new uploads are not. Callers may update only their own store; `super_admin` keeps the existing explicit cross-store allowance on these admin routes. Native icon files and splash rendering stay build-time under the 2026-07-17 runtime branding decision.
- Clarified 2026-09-28: issue #174 adds `iconUrl` / `appIconUrl` and `splashUrl` / `splashImageUrl` to public `GET /api/v1/store/config` from this same branding document. A value is included only when it is an absolute `http` or `https` URL and is not token-shaped (`shpat_`, `shpss_`, `shpca_`, `shpct_`, `shpua_`, `access_token`, bearer). Invalid or unset values are omitted, not returned as `null`. A bad branding value does not fail the request. `logoUrl` on that public route uses the same token check. The store is still chosen with `X-Store-ID`. Shopify Admin tokens are not selected. This does not change dashboard UI, mobile splash rendering, checkout, payment, authentication, or Shopify token ownership.
- Clarified 2026-09-28: issue #177 adds `store.appName`, `store.iconUrl`, and `store.splashUrl` to each item on platform-ops `GET /api/v1/admin/build-requests` so an operator can set EAS env from the queue. `appName` is the Cartaisy store name. Icon and splash are the same `Store.branding` fields as branding GET and public store config. This ops response returns a URL only when it is absolute `https` and not token-shaped, including token-shaped path or query values, OAuth secrets (`client_secret`, `refresh_token`), and signed-upload markers (`api_secret`, `api_key`). Embedded URL credentials are dropped. An already-stored `http` URL that branding GET still returns is `null` here. Missing branding is `null`, not a generated CDN URL. Shopify Admin tokens are not selected. The issue #170 platform-ops gate is unchanged. Merchant build-request routes do not gain these fields. This does not start EAS.
- Reason: The dashboard already edits icon and splash, but a missing backend route left the URLs only on the dashboard store record. White-label reload needs them on the live branding document. Shopify Admin tokens must not ride along in an image URL. Shopper cold-start needs the same URLs on the public store config.
- Impact: Issue #173 stores the fields. Issue #174 publishes the validated URLs on `GET /api/v1/store/config`. Issue #177 publishes the https-only icon and splash, plus the store name as `appName`, on the platform-ops build queue. Dashboard clients can stop depending on dashboard-only `brandAssets` after a branding reload. This does not start EAS builds.
- Related docs: `docs/STATUS.md`, `docs/cartaisy/BUILD_REQUEST_API.md`. GitHub issues: #173, #174, #177.

### Build requests can start EAS builds on Cartaisy's Expo account

- Date: 2026-09-28.
- Decision: When a store admin creates a build request, the backend may start one EAS Workflow run per requested platform on Cartaisy's Expo account. The robot token (`EXPO_TOKEN`), project id (`EAS_PROJECT_ID`), workflow file name (`EAS_WORKFLOW_FILE`), and git ref (`EAS_GIT_REF`, default `main`) come from the API process environment. They are never returned to the dashboard, the mobile app, logs, or API responses. The project id is not taken from the request. If those values are missing or invalid, the request stays `queued`, the platform gains a merchant-safe `message`, and platform ops can still paste `installUrl`. A successful workflow writes `platforms.*.installUrl` from the Expo build page and sets `ready`. A failed run sets `failed` with a fixed merchant-safe message. A manual status or install-link edit stops automation for that platform. Store-owner Apple Developer and Google Play connect, and EAS Submit, stay out of scope.
- Clarified 2026-09-29: issue #196. When the workflow's build is `FINISHED`, the platform status is `ready` even if Expo has no scannable install URL. `installUrl` is set only from a public https `expo.dev` or `expo.io` URL on that build (`artifacts.buildUrl`, or an Expo-hosted archive URL) when the build is internal distribution, or when Expo omits `distribution`. Store distribution, simulator distribution, and `isForIosSimulator` leave `installUrl` unset. A later poll does not replace a stored URL with null. `EXPO_TOKEN` is not placed in the URL.
- Reason: Daniyal approved this on 2026-09-28 (issue #182). The manual install-link bridge stays until Expo credentials and the workflow file are in place. Builds stay on Cartaisy's Expo account (2026-07-17). This does not reopen merchant-owned Expo projects or app-store submission.
- Impact: The API process polls in-flight runs about once a minute. The workflow file lives in the Expo project's repository and must accept the documented inputs (`platform`, `storeId`, and optional `appName`, `storeSlug`, `iconUrl`, `splashUrl`). There is still no per-store bundle id or package name. Icon and splash are sent only when they are absolute `https` URLs with no token-shaped text.
- Related docs: `docs/cartaisy/BUILD_REQUEST_API.md`, `.env.example`. GitHub issue: #182.

### EAS Submit uses the store's Apple and Google credentials

- Date: 2026-09-28.
- Decision: A store admin can submit one finished platform of a build request to App Store Connect or Google Play. The API decrypts that store's `StoreAppCredentials` in process, passes them to EAS Submit, then wipes the temp file. Cartaisy's `EXPO_TOKEN` and `EAS_PROJECT_ID` stay server-side and are the same variables build dispatch already uses. `EAS_WORKFLOW_FILE` and `EAS_GIT_REF` are unchanged and are not read by submit. The store id comes from auth. Job status is `queued`, `submitting`, `submitted`, or `failed`, with a fixed message and no key material. Android uses the Play internal track. `ascAppId` is still not stored.
- Reason: Issue #187. Merchants submit under their own Apple and Google accounts. The 2026-09-28 build decision left EAS Submit out of scope; this entry is that follow-up and does not reopen merchant-owned Expo projects.
- Impact: Dashboard issue #67 calls `POST /api/v1/build-requests/:id/submits` and polls the GET routes in `docs/cartaisy/STORE_SUBMIT_API.md`. Missing or unreadable credentials and a missing finished artifact are rejected before a job is stored. Build create and the workflow poller are unchanged.
- Related docs: `docs/cartaisy/STORE_SUBMIT_API.md`, `docs/cartaisy/STORE_CREDENTIALS_API.md`, `docs/cartaisy/BUILD_REQUEST_API.md`, `.env.example`. GitHub issue: #187.

### Merchant password reset uses a dashboard link and does not mint passwords for Google-only accounts

- Date: 2026-09-28.
- Decision: `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password` are the merchant recovery API. The emailed link is `{DASHBOARD_URL}/reset-password?token={64-char hex}`, falling back to `FRONTEND_URL` when `DASHBOARD_URL` is unset. Dashboard issue #68 owns that page. The token is single-use, expires in 10 minutes, and is stored as a SHA-256 hash. Forgot-password always returns the same success body for an unknown email, a Google-only account, an inactive account, an ambiguous email, and a mail failure. A dashboard user with no password hash receives an email that says to use Continue with Google and does not receive a reset link. A user who already has a password still receives a reset link after they have also signed in with Google. A successful reset sets `passwordChangedAt`, and access plus refresh tokens issued before that second stop working. Shopper reset on `/api/v1/customer/auth` is unchanged.
- Reason: Merchants need a recovery path when password login fails. A reset link on a Google-only account would create a password that account never had. Silence would look like a broken reset. The HTTP response must not reveal which case the caller hit.
- Impact: Set `DASHBOARD_URL` to the dashboard origin in each environment. The raw token and the new password must not be logged. See `docs/MERCHANT_PASSWORD_RESET.md`.
- Related docs: `docs/MERCHANT_PASSWORD_RESET.md`, `.env.example`. GitHub issue: #188. Dashboard issue: #68.

### One merchant user can belong to many stores

- Date: 2026-09-29.
- Decision: A dashboard user keeps one account and may belong to many stores. `User.storeIds` is the membership list. `User.storeId` stays the active store and the tenant boundary for store-scoped reads. An empty membership with `storeId` set is treated and saved as `[storeId]`. `GET /api/v1/auth/stores` returns only that caller's stores (`id`, `name`, `slug`, and a safe `logoUrl` or `iconUrl` when the value is an http(s) URL and not token-shaped). `POST /api/v1/auth/stores/switch` sets the active store only when the id is already in `storeIds`, and otherwise returns 403. The same access token and refresh token stay valid. Creating another store is first-class, not optional: `POST /api/v1/auth/stores` accepts `storeName` or `name`, creates a new Store with a unique slug (retry on collision), appends that id to `storeIds`, and sets it as the active `storeId` so onboarding targets the new store. The response is the new store plus the updated user store fields, and it does not issue tokens. Only a `super_admin` who already belongs to at least one store may create. Invited `admin` and `moderator` users cannot. v1 has no per-store role matrix, so "store owner" means account role `super_admin` plus membership. An account may hold at most 10 stores; the next create returns 400. An empty or whitespace name returns 400. The new store is a fresh signup store: Shopify disconnected, and branding, home layout, app credentials, and Shopify or Expo tokens are not copied from the previous store. Login, Google sign-in, refresh, and profile keep returning the active `storeId`. Google returns 409 `AMBIGUOUS_MERCHANT_ACCOUNT` only when more than one dashboard User document shares the email. One user with many `storeIds` is not that conflict. Admin ownership still treats the active store as it does today for `admin` and `moderator`. A `super_admin` with a membership may open only those stores, except platform operators (`isPlatformOperator` or a verified `PLATFORM_OPS_EMAILS` match), who keep cross-store access. A `super_admin` with no membership still has the previous cross-store allowance. When a membership exists and the request omits a store id on an optional-store admin route, that merchant is scoped to the active store instead of a platform-wide aggregate. Profile updates cannot change `storeId` or `storeIds`.
- Reason: Merchants with more than one branded app need to add a store and switch the active one without signing out. Creating a second User per app made Google sign-in 409 and split one person across accounts. A new app must start disconnected so one store's Shopify connection, branding, and credentials cannot leak into the next. Tenant data stays separated by the active `storeId`.
- Impact: Existing single-store users keep working through the backfill. Dashboard issue #131 calls list, switch, and create, and uses the create response to point onboarding at the new store without a new login. Responses do not include Shopify tokens or Expo tokens. No billing, org hierarchy, or shopper multi-store behavior is added. Invite-only signup is unchanged. The 10-store cap is a product limit, not a paid plan.
- Related docs: `docs/MERCHANT_STORE_MEMBERSHIP.md`, `docs/STATUS.md`. GitHub issue: #202. Dashboard issue: #131.

### A store owner can turn off a store, and the last store stays

- Date: 2026-09-30.
- Decision: `DELETE /api/v1/auth/stores/:storeId` removes one app from merchant membership. The body `{ name }` must match the stored store name. Only a `super_admin` who already belongs to that store may call it. The caller's last remaining store is refused with `409` `LAST_STORE`, because create still requires a membership and an account with zero stores cannot add another app. The store record is soft-deleted (`isActive: false`), matching account deletion, and Shopify is disconnected with the existing revoke-and-clear path before membership changes. The id is removed from every user's `storeIds`. A user whose active store was the removed one moves to their next membership id, or has `storeId` cleared when none remain. A unique `{ storeId, email }` collision for any affected user, including clearing `storeId`, is `409` `ACTIVE_STORE_CONFLICT` before Shopify is disconnected. Users are not deleted. Orders, home layouts, and store-account credentials are not cascade-deleted. The response does not include a new access token. A store outside membership is `403` and is not modified.
- Reason: Merchants can add a blank app and then have no way to drop an unfinished one. Hard-deleting the store, or deleting every user on `storeId`, would destroy the account that still owns other apps. Keeping the last app avoids a locked-out owner.
- Impact: Dashboard delete UI calls this route and must not call a local store delete that removes users. Shopify Admin tokens on the removed store are cleared. `shopify.complianceShop` still resolves compliance webhooks. Human review is required because this changes membership and Shopify credentials. Deploy the backend before the dashboard delete UI (dashboard PR #135).
- Related docs: `docs/MERCHANT_STORE_MEMBERSHIP.md`, `docs/STATUS.md`, `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`. Dashboard PR: #135.

## Related docs/issues

- GitHub issue: #52.
- v1 onboarding epic: #152. This record: #156.
- `CARTAISY_CONTEXT.md`
- `AGENTS.md`
- `docs/cartaisy/README.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
