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
| Catalog sync status | `GET /api/v1/shopify/sync` | Store admin JWT | Durable status for the authenticated store only: `idle`, `syncing`, `succeeded`, or `failed`, plus timestamps, a safe `errorSummary`, and `eligibleForBuild`. A client `storeId` is ignored. |
| Sync again | `POST /api/v1/shopify/sync` | Store admin JWT | Same in-request full sync, using the backend token for that store only. Refuses when disconnected. Persists the status above. A fresh `syncing` run returns 409 `CATALOG_SYNC_IN_PROGRESS` and does not start a second sync. |
| Disconnect | `POST /api/v1/shopify/disconnect` | Store admin JWT | Revokes the token at Shopify, then clears it. Status becomes `disconnected`. If revoke fails, the token stays so disconnect can be retried. |

`GET /api/v1/shopify/oauth/connect` accepts the same `shop` query parameter. Existing `POST /api/v1/shopify/sync/full` remains for older admin callers. It does not write this durable catalog sync status. Build eligibility follows `POST /api/v1/shopify/sync` only.

## Catalog sync status and build eligibility

Issue #154. Status is stored on `Store.catalogSync` and is readable only for the authenticated store.

| Status | Meaning |
| --- | --- |
| `idle` | This shop has not completed a catalog sync. |
| `syncing` | Sync again is running, including quiet automatic retries. |
| `succeeded` | The latest run for this shop finished. |
| `failed` | The latest run failed after quiet retries. `errorSummary` is safe to show. |

Quiet retries: a thrown sync error is retried immediately up to two more times in the same request (three attempts total). The same happens when the sync returns without throwing but imported zero products and reported errors (Shopify fetch failures are returned that way). An empty catalog with no errors is `succeeded`. Status stays `syncing` during retries. The dashboard does not show attempt numbers. There is no background queue. A `syncing` record older than 15 minutes can be claimed again so a restarted process does not leave Sync again stuck. That reclaim is per process; two servers can both pass it.

Stores connected before this status existed read as `idle` and are not build-eligible until Sync again succeeds. The older admin and scheduled sync paths do not write `Store.catalogSync`.

Build eligibility minimal bar: the store is eligible only when Shopify is connected and `catalogSync.status` is `succeeded` for that same shop domain. `idle`, `syncing`, `failed`, a success for a different shop, and a disconnected store are rejected. `shopify.lastSyncAt` is not the bar — connect stamps it before any catalog sync. A later failure stays ineligible even if `lastSucceededAt` is still set.

Sibling build-request creation (issue #155) must call `assertBuildEligible(storeId)` from `src/services/catalogSyncService.ts` before inserting a request. On failure it throws `BuildNotEligibleError` (`code` `BUILD_NOT_ELIGIBLE`, HTTP 409). `reason` is `shopify_not_connected` or `catalog_sync_not_succeeded`. Use `buildEligibilityErrorBody(error)` for the response:

```json
{
  "success": false,
  "error": "Sync the catalog successfully before requesting a build. Use Sync again.",
  "code": "BUILD_NOT_ELIGIBLE",
  "reason": "catalog_sync_not_succeeded"
}
```

OAuth refuses to switch shops until the current shop is disconnected. After that, connecting a different shop resets catalog sync to `idle`. Reconnecting the same shop keeps a prior `succeeded` status, and build eligibility returns once Shopify is connected again.

### Dashboard UI copy

The primary call-to-action label is **Sync again**. Do not label it "Sync now" or "Retry".

| Status | Copy | Sync again | Build |
| --- | --- | --- | --- |
| `idle` | Catalog has not synced yet. Sync again to import your products. | Enabled | Disabled |
| `syncing` | Syncing your catalog… | Busy, disabled | Disabled |
| `succeeded` | Catalog synced. | Enabled, to run again | Enabled when Shopify is connected |
| `failed` | Sync failed. Show `errorSummary`, then Sync again. | Enabled | Disabled |

Do not mention the automatic retries. If the button is pressed while status is already `syncing`, keep showing the syncing state. The API returns 409 `CATALOG_SYNC_IN_PROGRESS`. A finished failure returns 502 `CATALOG_SYNC_FAILED` with the same status object the GET returns, so the screen can render `failed` without a second request. `primaryAction` in the payload is always `Sync again`.

Build my app is a separate tracked request, not this sync route (issue #155, dashboard `daneylpasha/cartaisy-dashboard#17`). `POST /api/v1/build-requests` calls `assertBuildEligible(storeId)` before insert and returns `buildEligibilityErrorBody` at HTTP 409 when it throws. It does not write `Store.catalogSync`. Contract: `docs/cartaisy/BUILD_REQUEST_API.md`.

When `SHOPIFY_OAUTH_RETURN_URL` is set, the callback redirects the browser there with `shopify=connected` or `shopify=error` and a short `reason`. The return URL is taken only from that environment variable.

Webhook HMAC verification and shop-domain-to-Store mapping stay store-scoped. Disconnect and `app/uninstalled` clear `shopify.shop` and `shopify.isConnected`, so a disconnected shop no longer resolves for catalog, order, or customer webhooks. Both paths copy that shop domain onto `shopify.complianceShop` before clearing it. Mandatory compliance webhooks use that retained domain so `shop/redact` can still find the store. See the compliance section below.

Historical tokens already stored in the dashboard database are not migrated by this contract.

## Mandatory compliance webhooks

Issue #162. Shopify requires `customers/data_request`, `customers/redact`, and `shop/redact` for any app that is distributed. Cartaisy also handles `app/uninstalled`. These are **app-level** subscriptions. Compliance topics cannot be created with the Admin API `webhookSubscriptionCreate`, and this backend does not register them per store during connect.

Every route below verifies `X-Shopify-Hmac-Sha256` with `SHOPIFY_WEBHOOK_SECRET` (the app client secret, not a merchant token) and resolves `X-Shopify-Shop-Domain` to one Cartaisy store. A webhook for shop A never reads or writes store B. HMAC failure is `401`. A shop that cannot be mapped safely (unknown, malformed, or more than one store) is acknowledged with `200` and no writes, so Shopify does not retry a delivery that can never be applied. A store-scoped write that throws returns `500` so Shopify retries; the handlers are idempotent.

| Topic | Method and path | When Shopify sends it |
| --- | --- | --- |
| `customers/data_request` | `POST /api/webhooks/shopify/customers/data_request` | A customer asks the merchant for their data |
| `customers/redact` | `POST /api/webhooks/shopify/customers/redact` | A customer or merchant asks for that customer's data to be erased |
| `shop/redact` | `POST /api/webhooks/shopify/shop/redact` | 48 hours after the app is uninstalled |
| `app/uninstalled` | `POST /api/webhooks/shopify/app/uninstalled` | The merchant uninstalls the app, or the token is revoked |
| Any of the four | `POST /api/webhooks/shopify/compliance` | Same handlers. The topic is `X-Shopify-Topic` |

`POST /api/webhooks/shopify/compliance` is the URL to use when the Partner app config has one `uri` for every `compliance_topics` entry. The four specific paths are for the Dev Dashboard GDPR fields, or for one `[[webhooks.subscriptions]]` block per topic.

### Operator configuration

Set this on the Shopify app (Dev Dashboard or `shopify.app.toml`) and deploy the app config. Do not subscribe to these topics per shop from the backend.

`app/uninstalled` is a normal topic, not a `compliance_topics` entry. Subscribe to it at app level as well so every install is covered without a per-store Admin API registration.

```toml
[webhooks]
api_version = "2024-10"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "https://<api-host>/api/webhooks/shopify/app/uninstalled"

[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "https://<api-host>/api/webhooks/shopify/compliance"
```

Separate URLs, if the dashboard asks for one field per GDPR topic:

| Dashboard field | URL |
| --- | --- |
| Customer data request | `https://<api-host>/api/webhooks/shopify/customers/data_request` |
| Customer data erasure | `https://<api-host>/api/webhooks/shopify/customers/redact` |
| Shop data erasure | `https://<api-host>/api/webhooks/shopify/shop/redact` |

`SHOPIFY_WEBHOOK_SECRET` must be the app's client secret. The handlers do not log tokens, webhook secrets, or customer PII (email, phone, name, address).

### v1 behavior

**`customers/data_request`.** Cartaisy does not email the customer or the merchant. It writes one `ShopifyComplianceRequest` for that store, keyed by Shopify's `data_request.id`, so a replay does not create a second row. The row stores the shop domain, Shopify customer id, requested Shopify order ids, and the ids of matching local `User` (role `customer` or `premium_customer`) and `Customer` documents. It does not store email or phone. Ops fulfills the request from that record:

- Mobile `Customer` ids: existing `POST /api/v1/stores/:storeId/compliance/export/customer/:customerId`.
- Shopify-imported shoppers live on `User`. The matched user id on the compliance record is the handoff. That admin export route only loads `Customer`, so it will not return a `User`.

**`customers/redact`.** Inside the resolved store only: anonymize matching customer-role users (email replaced, phone and addresses cleared, Shopify customer id removed, account deactivated), delete matching `Customer` documents, anonymize matching orders (email, addresses, guest contact, notes; monetary totals stay), and delete directly owned shopper rows (payment methods, wishlists, favorites, product views, search history, cart activity, checkout sessions, and similar). Match keys are the Shopify customer id, the customer email, and `orders_to_redact`. Merchant roles (`admin`, `super_admin`, `moderator`) are not modified. A second delivery is a no-op against data that is already redacted.

**`shop/redact`.** Same shopper erasure for every customer-role user, `Customer`, order, and guest checkout in that store. It also deletes that store's search history, app sessions, and analytics events that carry a user, search query, location, or device id. Credentials are cleared only when that store is not connected (see below). The Store document, merchant users, branding, and product catalog stay. Product documents are catalog copies and are not customer PII in v1.

**`app/uninstalled`.** Marks the store disconnected and clears the Admin token, Storefront token, scope, and shop domain used for API calls. It does **not** call Shopify to revoke the token: the token is already revoked, and a failed revoke would leave it stored (that is the merchant `POST /api/v1/shopify/disconnect` rule). `getAccessToken` and `getShopifyClientForStore` return nothing afterward. Catalog sync status is left as-is; build eligibility fails with `shopify_not_connected` because the store is disconnected. Customer rows stay until `shop/redact`. Replay clears the same fields again. If `X-Shopify-Triggered-At` is older than the store's current `shopify.connectedAt`, the delivery is acknowledged and the newer connection is left in place.

**`shop/redact` and a live reconnect.** Shopper data for that store is still redacted. Credentials are cleared only when the store is not connected. A merchant who installed the app again keeps the new token.

A store that is connected to a different shop is not selected via an older `complianceShop` value, so a redact for the previous shop cannot erase the shop that is connected now.

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
- GitHub issue: #154 (durable catalog sync status and build eligibility).
- GitHub issue: #155 and `docs/cartaisy/BUILD_REQUEST_API.md` (tracked build request; dashboard `daneylpasha/cartaisy-dashboard#17`).
- GitHub issue: #162 (mandatory compliance webhooks and `app/uninstalled`).
