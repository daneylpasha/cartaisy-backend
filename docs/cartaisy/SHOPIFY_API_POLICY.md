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

## Dashboard connect contract

The backend is the only owner of Shopify access tokens for new merchant connects. The dashboard starts and continues connect through these APIs and must not persist `shopify.accessToken` (or the Storefront token) in its own database.

| Action | Method and path | Auth | Result |
| --- | --- | --- | --- |
| Start connect | `POST /api/v1/shopify/oauth/connect` with `{ "shop": "store.myshopify.com" }` | Store admin JWT | `{ authorizationUrl, state, tokenOwner: "backend" }`. Redirect the merchant's browser to `authorizationUrl`. `state` is CSRF material, not a Shopify token. |
| Complete connect | `GET /api/v1/shopify/oauth/callback` | Public. Shopify redirects the browser here. | Exchanges the code, encrypts the Admin token onto that store only, and best-effort provisions the Storefront token. Response and optional browser redirect never include the token. |
| Connection status | `GET /api/v1/shopify/status` | Store admin JWT | `status` is `connected` or `disconnected` for the authenticated store. A client `storeId` is ignored. |
| Disconnect | `POST /api/v1/shopify/disconnect` | Store admin JWT | Revokes the token at Shopify, then clears it. Status becomes `disconnected`. If revoke fails, the token stays so disconnect can be retried. |
| Trigger sync | `POST /api/v1/shopify/sync` | Store admin JWT | Runs a full sync with the backend token for that store only. Refuses when disconnected. Durable sync status and build eligibility are issue #154. |

`GET /api/v1/shopify/oauth/connect` accepts the same `shop` query parameter. Existing `POST /api/v1/shopify/sync/full` remains for older admin callers.

When `SHOPIFY_OAUTH_RETURN_URL` is set, the callback redirects the browser there with `shopify=connected` or `shopify=error` and a short `reason`. The return URL is taken only from that environment variable.

Webhook HMAC verification and shop-domain-to-Store mapping are unchanged and stay store-scoped. Disconnect clears `shopify.shop` and `shopify.isConnected`, so a disconnected shop no longer resolves to a store.

Historical tokens already stored in the dashboard database are not migrated by this contract.

## Partner app environment variables

These are the Shopify Partner app credentials for the OAuth flow. They are app-level, not per merchant. Per-store Admin and Storefront tokens are written only to the backend `Store` document.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SHOPIFY_CLIENT_ID` | Yes | Partner app client ID. Sent to Shopify as `client_id` on the authorize URL. |
| `SHOPIFY_CLIENT_SECRET` | Yes | Partner app secret. Used for the code exchange and to verify the callback HMAC. Never send this to the dashboard or mobile app. |
| `SHOPIFY_REDIRECT_URI` | Yes | Must match an allowed redirection URL on the Partner app exactly. Point it at this backend, for example `https://<api-host>/api/v1/shopify/oauth/callback`. |
| `SHOPIFY_SCOPES` | Yes | Comma-separated Admin API scopes requested at install. |
| `SHOPIFY_OAUTH_RETURN_URL` | No | Absolute `http` or `https` URL of the dashboard page that should continue after connect. The access token is not appended. |
| `SHOPIFY_API_VERSION` | No | Admin API version used during connect. Defaults to `2024-01`. |
| `SHOPIFY_WEBHOOK_SECRET` | Yes for webhooks | App webhook HMAC secret. This is not the merchant access token. |

`SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` are fallbacks for the client ID and secret when the `SHOPIFY_CLIENT_*` names are unset. `SHOPIFY_ACCESS_TOKEN` and `SHOPIFY_STOREFRONT_ACCESS_TOKEN` are legacy global env credentials. New merchant connects must not use them; the token for a store is `Store.shopify.accessToken`, encrypted, and readable only by store-scoped backend calls.

## Related docs/issues

- GitHub issue: #50.
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
- GitHub issue: #153 (backend sole owner of Shopify OAuth tokens for new connects).
