# Product North Star

Cartaisy is a managed Shopify mobile-app SaaS. The goal is to help Shopify merchants get branded iOS and Android apps without hiring a mobile development team.

Cartaisy generates merchant-branded mobile apps from one reusable app engine. It is not a custom app agency, and the MVP should not be expanded into bespoke merchant-by-merchant implementation work. It is also not initially a full drag-and-drop no-code mobile app builder.

## Current state

- The backend repo contains mobile shopping APIs, store configuration surfaces, customer features, home module configuration, Shopify services, and tenant-related audits.
- Existing docs indicate Cartaisy is moving toward a multi-tenant SaaS model backed by Shopify merchant stores.
- Do not assume this exists unless verified in code: automated app generation, full build orchestration, app-store submission automation, no-code page building, or every Shopify flow being tenant-safe today.

## Target state

- Merchants connect Shopify, configure branding and home content, and receive a branded mobile app using a reusable Cartaisy app engine.
- Cartaisy owns the app engine, core commerce UX, integration patterns, release workflow, and SaaS guardrails.
- Merchant differences are configuration and theme data, not one-off forks or custom code branches.

## Known gaps

- Confirm in each repo which parts of onboarding, app generation, build flow, and dashboard configuration are implemented.
- Confirm which Shopify API paths are tenant-safe before treating them as production SaaS-ready.
- Any request for merchant-specific custom app behavior should be treated as a scope decision, not an automatic implementation task.

## Related repo responsibilities

- Backend: store-scoped APIs, Shopify integration, tenant isolation, customer/admin data, and server-side secrets.
- Mobile: reusable branded app engine and client behavior driven by backend configuration.
- Dashboard: merchant setup, branding, content configuration, Shopify connection, and build/onboarding workflows.

## Related docs/issues

- GitHub issue: #50.
- `docs/cartaisy/SAAS_SCOPE.md`
- `docs/cartaisy/CROSS_REPO_MAP.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
