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

### Keep backend docs linked to shared Cartaisy context

- Date: 2026-07-01.
- Decision: Backend context docs should link to the shared Cartaisy SaaS context under `docs/cartaisy/README.md`.
- Reason: Shared product and architecture assumptions should stay portable across backend, mobile, and dashboard repos.
- Impact: Backend docs should summarize local details and link to shared policy rather than duplicating large sections.
- Related docs: `CARTAISY_CONTEXT.md`, `docs/cartaisy/README.md`.

## Related docs/issues

- GitHub issue: #52.
- `CARTAISY_CONTEXT.md`
- `AGENTS.md`
- `docs/cartaisy/README.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
