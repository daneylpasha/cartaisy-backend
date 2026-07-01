# Cross-Repo Map

Cartaisy is a multi-repo product. Shared behavior must be coordinated across backend, mobile, and dashboard instead of being solved as isolated repo work.

## Current state

- This backend repo owns server-side APIs, data models, middleware, Shopify services, and backend-specific docs.
- Mobile and dashboard implementation details are not verified from this repo. Do not assume this exists unless verified in those repos.
- Existing backend docs reference mobile-facing APIs, admin/dashboard routes, home modules, store settings, branding, customer features, and Shopify integration.

## Target state

- Backend responsibilities:
  - Store-scoped APIs and tenant-owned data.
  - Shopify Admin/Storefront calls through store-specific credentials.
  - Customer/admin authentication boundaries.
  - Webhooks, background jobs, sync flows, and operational docs.
- Mobile responsibilities:
  - Reusable branded iOS/Android app engine.
  - Rendering store branding, home modules, catalog, cart, checkout entry, account, and notifications from backend-supported contracts.
  - Protecting client-side token boundaries.
- Dashboard responsibilities:
  - Merchant onboarding, Shopify connection, branding, home module management, app/build configuration, and admin workflows.
  - Publishing only supported configuration shapes.

## Known gaps

- Verify the mobile app engine, dashboard onboarding, build flow, and contract usage in their own repos before claiming readiness.
- Cross-repo API contracts may be incomplete or drifting unless documented and tested.
- Examples below are coordination areas, not proof that each feature is implemented end to end.

## Related repo responsibilities

- Branding: dashboard configures, backend stores/serves, mobile renders.
- Home modules: dashboard edits, backend validates/stores/serves, mobile renders supported module types.
- Checkout: backend documents and exposes approved strategy, mobile launches/consumes it, dashboard avoids changing it without approval.
- Onboarding: dashboard collects merchant setup, backend stores and validates tenant/Shopify state, mobile/build flow uses approved config.
- Build flow: dashboard or control-center requests builds, mobile repo provides reusable app engine, backend may provide config and status APIs if scoped.

## Related docs/issues

- GitHub issue: #50.
- `docs/HOME_MODULE_CONFIG_AUDIT.md`
- `docs/cartaisy/SAAS_SCOPE.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
