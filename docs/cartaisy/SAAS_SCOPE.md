# SaaS Scope

Cartaisy scope should stay focused on launching a managed Shopify mobile-app SaaS. AI agents must not casually expand product scope, merchant customization, checkout strategy, Shopify assumptions, or build automation.

## Current state

- The backend repo includes mobile-facing APIs, customer/admin routes, store models, Shopify services, and audits that identify tenant-safety and Shopify credential risks.
- The current codebase should be treated as a backend implementation in progress, not proof that the full SaaS product is complete.
- Do not assume this exists unless verified in code: production-ready multi-tenant Shopify calls, end-to-end merchant onboarding, automated app builds, public SaaS billing, or app-store submission workflows.

## Target state

- MVP scope:
  - One reusable mobile app engine for branded merchant apps.
  - Store-scoped backend APIs for mobile and dashboard workflows.
  - Shopify-backed catalog, cart, checkout, and order strategy where explicitly designed and implemented.
  - Merchant branding and home content configuration.
  - Private beta onboarding for the first merchant with documented operational steps.
- Deferred scope:
  - Full drag-and-drop no-code app builder.
  - Bespoke merchant-specific app features.
  - Complex marketplace, loyalty, subscriptions, and enterprise-only Shopify features unless approved.
  - Fully automated app-store submission and release management unless separately scoped.
- Human approval is required for:
  - Checkout/payment strategy changes.
  - Tenant-isolation model changes.
  - Shopify token, credential, webhook, or order assumptions.
  - Merchant-specific exceptions.
  - Expansion into deferred scope.

## Known gaps

- MVP feature completeness must be verified across backend, mobile, and dashboard repos.
- Checkout and orders require explicit documentation before implementation changes.
- App build and onboarding readiness may depend on repo or infrastructure work not visible in this backend repo.

## Related repo responsibilities

- Backend: only implement scoped APIs and tenant-safe integrations.
- Mobile: consume documented configuration rather than hard-coded merchant behavior.
- Dashboard: expose only supported configuration and onboarding flows.

## Related docs/issues

- GitHub issue: #50.
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
- `docs/cartaisy/TENANCY_MODEL.md`
