# Shopify API Policy

Shopify is the source of truth for catalog, cart, checkout, and orders where the relevant Cartaisy flow is designed to rely on Shopify. Exact behavior must be verified before implementation.

## Current state

- The backend repo contains Shopify Admin API, Storefront API, OAuth, sync, order, cart, checkout-adjacent, and storefront services.
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md` identifies current tenant-client risks, including singleton/global Shopify clients and legacy helpers that may select the first connected store.
- Do not assume this exists unless verified in code: all Shopify reads and writes using store-scoped credentials, checkout strategy being finalized, or order assumptions being safe for SaaS production.

## Target state

- Mobile clients must never contain Shopify Admin tokens, private access tokens, refresh tokens, API secrets, webhook secrets, or app credentials.
- Backend Shopify calls must use store-scoped credentials for the merchant store being served.
- Checkout strategy must be explicitly documented before implementation. This includes whether checkout is Shopify web checkout, Storefront cart checkout URL, draft orders, custom payment flow, or another approved path.
- Avoid depending on Shopify Plus, Enterprise-only, or merchant-plan-specific features for MVP unless explicitly approved.
- Orders API assumptions must be documented before implementation, including source of truth, sync direction, webhook handling, order identity, and customer visibility.

## Known gaps

- Several Shopify flows may still need store-scoped refactors. Verify against code and the tenant-client audit before treating any flow as SaaS-ready.
- Checkout and order completion are high-risk areas. Do not change them without a focused issue and human approval.
- Storefront token availability, Admin token encryption/decryption, and webhook validation must be verified in the backend before production launch.

## Related repo responsibilities

- Backend: hold Shopify secrets server-side, resolve store-specific credentials, validate webhooks, document checkout/order assumptions, and prevent global credential fallback in SaaS/prod.
- Mobile: consume backend APIs and safe public checkout URLs only; never ship private Shopify credentials.
- Dashboard: connect Shopify stores through approved OAuth/configuration flows and display only store-authorized data.

## Related docs/issues

- GitHub issue: #50.
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
