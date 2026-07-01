# MVP Release Plan

The MVP release plan should separate private beta readiness from public SaaS readiness. Do not present launch goals as already complete without code and operational verification.

## Current state

- Backend docs and audits exist for store ownership, Shopify tenant-client behavior, and home module configuration.
- The backend repo contains many APIs and services that appear relevant to a Shopify mobile-app SaaS, but implementation completeness must be verified.
- Do not assume this exists unless verified in code: first merchant onboarding readiness, public SaaS readiness, automated app builds, complete checkout/order strategy, or full tenant isolation.

## Target state

- Private beta readiness definition:
  - One merchant can be onboarded with documented manual or semi-manual steps.
  - Store context and Shopify credentials are configured safely for that merchant.
  - Mobile app can render branding, home content, catalog, and approved checkout path.
  - Known operational risks are documented before launch.
  - Rollback or recovery notes exist for risky setup steps.
- Public SaaS readiness definition:
  - Repeatable merchant onboarding.
  - Strong tenant isolation across customer, admin, Shopify, webhook, background job, and analytics flows.
  - Documented checkout and orders strategy.
  - Supported dashboard configuration and app build workflow.
  - Monitoring, secrets handling, support, and incident response basics.

## Known gaps

- Known blockers to verify before onboarding the first merchant:
  - Tenant-safe Shopify Storefront and Admin API paths.
  - Store ownership enforcement for authenticated customer/admin routes.
  - Checkout and order assumptions.
  - Dashboard configuration completeness.
  - Mobile app contract compatibility.
  - Build/release process for iOS and Android.
- Backend-only changes cannot prove mobile, dashboard, or app-store readiness.

## Related repo responsibilities

- Backend: tenant-safe APIs, Shopify integration, operational checks, and server-side release notes.
- Mobile: beta app build, config rendering, checkout entry behavior, and crash/analytics readiness.
- Dashboard: merchant onboarding, setup validation, branding/home content management, and build-flow status.

## Related docs/issues

- GitHub issue: #50.
- `docs/cartaisy/ISSUE_PRIORITY_RULES.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
- `docs/cartaisy/CROSS_REPO_MAP.md`
