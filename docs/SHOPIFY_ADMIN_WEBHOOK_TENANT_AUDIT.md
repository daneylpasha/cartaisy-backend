# Shopify Admin Helpers and Webhook Tenant Mapping Audit

GitHub issue: #49
Audit date: 2026-07-01

## Scope

This audit covers Shopify Admin API helper functions, sync jobs, inventory/order helper paths, and Shopify webhook tenant mapping. It is documentation-only. It does not change checkout, payment, order model design, dashboard UI, mobile app behavior, webhook topics, or runtime service wiring.

## Executive summary

- First-connected-store usage is confirmed. The legacy Admin helper `getShopifyClient()` selects `Store.findOne({ 'shopify.isConnected': true })`, so any caller without an explicit `storeId` can operate against an arbitrary connected merchant store.
- A safer Admin helper already exists: `getShopifyClientForStore(storeId)` resolves the requested `Store`, decrypts encrypted Admin tokens when needed, and builds an Admin API client for that store.
- Most high-impact sync, inventory, and legacy order helpers still call the first-connected-store helper instead of the store-scoped helper.
- Webhook tenant mapping is not implemented. Webhook routes do not use signature verification, do not read `X-Shopify-Shop-Domain`, and do not resolve the incoming shop domain to `Store`.
- The inventory webhook has a current correctness bug separate from the tenant roadmap: it matches Shopify `inventory_item_id` against `variants.id`, so inventory-level updates likely match zero products and are silently dropped.
- The current Product model is globally keyed by `shopifyProductId`, `handle`, and SEO slug and has no `storeId`, which blocks correct multi-tenant Shopify product sync/webhook behavior without a focused follow-up migration.
- `ShopifyOrderSyncService` is closer to the target shape because it reads `storeId` from the order and skips Shopify calls when missing, but it sends the stored access token directly and does not use the existing decrypt fallback.

## Files inspected

| File | Why inspected |
| --- | --- |
| `CLAUDE.md` | Repository architecture and coding standards. |
| `docs/cartaisy/README.md` | Shared SaaS and backend responsibility context. |
| `docs/cartaisy/TENANCY_MODEL.md` | Store tenant boundary and no-global-credential target state. |
| `docs/cartaisy/SHOPIFY_API_POLICY.md` | Shopify credential and checkout/order guardrails. |
| `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md` | Prior broader Shopify tenant-client audit. |
| `src/services/shopifyService.ts` | Primary Shopify Admin helper, sync, inventory, order, and webhook-signature helpers. |
| `src/services/inventoryService.ts` | Inventory sync/update helpers that delegate to Admin API helpers. |
| `src/services/syncService.ts` | Full, incremental, and scheduled sync orchestration. |
| `src/services/shopifyOrderSyncService.ts` | Draft-order and Shopify inventory sync for local orders. |
| `src/services/shopifyOAuthService.ts` | Store-specific OAuth credential persistence and shop metadata. |
| `src/services/shopifyAnalyticsService.ts` | Store-optional analytics queries that can become global if `storeId` is omitted. |
| `src/services/backgroundJobService.ts` | Scheduled sync and inventory jobs. |
| `src/services/orderService.ts` | Legacy mobile order path that can call global Shopify helpers. |
| `src/controllers/webhookController.ts` | Shopify webhook handlers and verification middleware. |
| `src/routes/webhookRoutes.ts` | Mounted webhook endpoints and verification wiring. |
| `src/routes/shopifyRoutes.ts` | Authenticated manual sync/inventory/Admin helper routes. |
| `src/routes/adminRoutes.ts` | Admin sync triggers and health checks that touch sync/Admin helpers. |
| `src/controllers/orderController.ts` | Order creation path using `ShopifyOrderSyncService`. |
| `src/controllers/checkoutController.ts` | Checkout completion inventory sync path using `ShopifyOrderSyncService`; inspected only, not changed. |
| `src/controllers/customerOrderController.ts` | Customer order creation path for store/order context comparison. |
| `src/controllers/orderManagementController.ts` | Admin order management store-scoped query comparison. |
| `src/controllers/shopifyOAuthController.ts` | OAuth connection flow and storeId state mapping. |
| `src/routes/shopifyOAuthRoutes.ts` | OAuth route auth and callback wiring. |
| `src/app.ts` | JSON body parsing and webhook route mount order. |
| `src/models/Store.ts` | Shopify connection fields and shop-domain lookup capability. |
| `src/models/Product.ts` | Product tenancy and Shopify identifier shape. |
| `src/models/Order.ts` | Order `storeId` availability and Shopify order fields. |
| `src/models/User.ts` | User `storeId` and per-store email index. |

## Unsafe helper patterns found

### Legacy Admin client selects the first connected store

`src/services/shopifyService.ts` has the desired store-scoped helper at lines 109-142, but the legacy helper at lines 148-182 selects the first connected store with:

```ts
Store.findOne({ 'shopify.isConnected': true }).select('+shopify.accessToken')
```

That first-connected-store behavior is explicitly used or inherited by:

| Helper | Risk |
| --- | --- |
| `testShopifyConnection()` | Calls `getShopifyClient()` and tests whichever connected store is returned. |
| `verifyShopifyStoreInfo()` | Finds first connected store at line 218 and then calls `getShopifyClient()` at line 230. |
| `getConnectedStoreInfo()` | Finds first connected store at line 279. |
| `syncProducts()` | Logs the first connected store and uses `getShopifyClient()` at lines 298-301. |
| `syncProduct()` | Calls `getShopifyClient()` at line 429, even when a webhook payload supplies the product. |
| `syncCustomers()` | Calls `getShopifyClient()` at line 571 and matches users by global email at line 595. |
| `syncOrders()` | Calls `getShopifyClient()` at line 677, matches orders by global `shopifyOrderId` at line 704, and users by global email at line 708. |
| `getInventoryLevels()` | Calls `getShopifyClient()` at line 805. |
| `adjustInventory()` | Calls `getShopifyClient()` at line 846 and uses the first location when no location is supplied. |
| `reduceShopifyInventoryForOrder()` | Delegates to `adjustInventory()` at line 896 without a storeId. |
| `updateInventory()` | Calls `getShopifyClient()` at line 913 and uses the first location when no location is supplied. |
| `createOrder()` | Calls `getShopifyClient()` at line 955 and creates a Shopify order in the first connected store. |
| `updateOrderStatus()` | Calls `getShopifyClient()` at line 1009. |

### Sync services are global

`performFullSync()` calls `syncProducts()`, `syncCustomers()`, and `syncOrders(90)` without a storeId at lines 49, 55, and 61. `performIncrementalSync()` calls `syncOrders(daysSinceLastSync)` without a storeId at line 113. `updateStoresLastSyncAt()` updates every connected store after a global sync at lines 534-536, so a successful sync against one first-connected store can mark all stores as synced.

`scheduledSync()` runs the same global sync functions, and `backgroundJobService` schedules global incremental, full, and inventory sync jobs at lines 60-72.

### Inventory services are global

`updateInventoryLevels(productId?)` reads Product by `_id`, then calls the global `getInventoryLevels(product.shopifyProductId)` at line 206. When no `productId` is passed, it iterates every active Shopify-backed Product at lines 235-243. `updateShopifyInventory()` reads Product by `_id` and calls the global `updateInventory(variantId, quantity)` at line 424. `bulkUpdateInventory()` delegates to those same unscoped helpers at lines 533 and 540.

### Product data cannot be safely scoped today

`Product` has no `storeId` field in `src/models/Product.ts`. Its `shopifyProductId` is globally unique at lines 134-137, `handle` is globally unique at lines 152-155, and indexes are global at lines 251-253. Product sync and product webhooks cannot safely support two stores with the same Shopify product ID, handle, or slug until Product tenancy is designed and migrated.

### Manual routes call global helpers

`shopifyRoutes` uses authentication, but does not pass a validated `storeId` into sync or inventory helpers. `/sync/full` and `/sync/incremental` call global sync helpers at lines 55-78, and `/inventory/sync` calls global `updateInventoryLevels(productId)` at line 102. The `/test-connection` route calls `getShopifyClient()` at line 421, does not await it, and then treats it like the old Shopify SDK client at lines 423-426; this path is both tenant-unsafe and likely broken.

`adminRoutes` currently has auth middleware commented out at lines 17-18, and `/sync/trigger` calls the same global sync helpers at lines 198-200. Authorization changes are outside this issue, but the route remains a way to trigger global sync behavior.

### Legacy order helper path can write to the wrong merchant

`orderService` still checks global `tenantConfig.shopify.storeUrl` and `tenantConfig.shopify.accessToken` before calling `createShopifyOrder()`, which uses the first-connected-store Admin client. It also calls `reduceShopifyInventoryForOrder()`, which delegates to the same global inventory helper path. This path was inspected but not changed because checkout/payment/order behavior was explicitly out of scope.

### Store-scoped order sync exists but is incomplete

`ShopifyOrderSyncService` reads `storeId` from the order and skips draft-order/inventory operations if it is missing at lines 52-59 and 176-180. This is the right tenant-safety posture. However, its private client sends `store.shopify.accessToken` directly at lines 25-29 instead of using the decrypt fallback that exists in `getShopifyClientForStore()`. It also depends on every order path setting `storeId` correctly.

## Webhook verification and tenant mapping

Webhook tenant-mapping status: not implemented at audit time.

> Update (2026-07-02, issue #63): the webhook tenant resolver is now implemented in `src/middleware/shopifyWebhookAuth.ts`. Raw-body capture, timing-safe HMAC verification, `X-Shopify-Shop-Domain` normalization, resolution to exactly one active connected `Store`, and fail-closed handler guards are enforced for all `/api/webhooks/shopify/*` routes. Store-scoped webhook writes (target behavior item 7 below) still depend on Product tenancy and remain follow-up work. The remainder of this section describes the state found during the audit.

Current behavior:

- Webhook routes are mounted at `/api/webhooks` in `src/app.ts` line 259, outside the versioned `/api/v1/*` strict store validation middleware.
- JSON parsing runs globally before route handlers at `src/app.ts` line 100. Shopify HMAC verification needs the exact raw request body, not a reserialized object.
- `verifyWebhookMiddleware` reads `X-Shopify-Hmac-Sha256`, computes the body with `JSON.stringify(req.body)`, and verifies against the single process-wide `tenantConfig.shopify.webhookSecret` at `src/controllers/webhookController.ts` lines 12-25.
- `verifyWebhookMiddleware` is not wired into routes. `src/routes/webhookRoutes.ts` line 15 says verification is disabled, and the routes call handlers directly at lines 19-32.
- `src/routes/webhookRoutes.ts` also exposes unauthenticated `GET /api/webhooks/health` at lines 35-41. The endpoint is low risk by itself, but it publicly confirms the webhook infrastructure and path prefix, so it should be treated as part of the webhook attack surface when deciding which routes remain public and which routes need HMAC gating.
- No webhook handler reads `X-Shopify-Shop-Domain`.
- No webhook handler calls the existing `Store.findByShopifyShop(shop)` static helper, even though `Store` stores indexed `shopify.shop` at `src/models/Store.ts` lines 97-102 and exposes `findByShopifyShop()` at lines 511-514.
- Product webhooks update or create products by global `shopifyProductId` only at `src/controllers/webhookController.ts` lines 53-71, 93-103, and 124-130.
- Order webhooks update or create orders by global `shopifyOrderId` only at lines 154-155, 197-255, 283-285, and 334-335. Created orders do not include `storeId`.
- Customer webhooks match users by global email or global `shopifyCustomerId` at lines 378-395 and 417-430.
- Inventory webhooks query `Product.find({ 'variants.id': inventoryLevel.inventory_item_id.toString() })` at lines 453-456. This compares Shopify inventory item IDs to Shopify variant IDs instead of `variants.inventoryItemId`. Because those are different Shopify identifiers, the handler likely matches zero products for every inventory-level webhook and silently drops all inventory updates today. Treat this as an immediate correctness hotfix candidate separate from the larger multi-tenant refactor; after Product tenancy exists, the lookup should also include `storeId`.

Current hotfix candidates before the full tenant refactor:

1. Fix `handleInventoryUpdate` to match `inventoryLevel.inventory_item_id` against `variants.inventoryItemId`, with a regression test proving a Shopify inventory-level webhook updates the intended product variant instead of matching zero products.
2. Decide whether `/api/webhooks/health` should remain intentionally public. If it remains public, keep its response minimal and document/rate-limit it as public infrastructure exposure; do not accidentally place it behind Shopify HMAC verification meant only for Shopify POST payloads.

Required target behavior:

1. Capture raw request body for Shopify webhook routes before JSON parsing mutates it.
2. Verify HMAC with the Shopify app webhook secret using timing-safe comparison.
3. Read and normalize `X-Shopify-Shop-Domain`.
4. Resolve the shop domain to exactly one active connected `Store`.
5. Attach trusted `storeId` to the webhook processing context.
6. Reject unknown, disconnected, or ambiguous shops before any Product/User/Order writes.
7. Include `storeId` in every webhook-driven query/write once the affected models support it.

## Sync, inventory, and order tenant-safety risks

| Area | Current behavior | Tenant-safety risk | Recommended follow-up |
| --- | --- | --- | --- |
| Admin client resolution | `getShopifyClient()` picks first connected Store. | Any caller can use the wrong merchant credentials. | Deprecate or restrict this helper; require `storeId` for runtime Admin calls. |
| Product sync | `syncProducts()` and `syncProduct()` use first connected store and global Product identifiers. | Products from one merchant can overwrite another merchant's catalog. | Add Product `storeId` and store-scoped sync helpers. |
| Customer sync | `syncCustomers()` uses first connected store and global email matching. | Customer profile data can merge across stores. | Match users/customers by `{ storeId, email }` and Shopify customer ID per store. |
| Order sync | `syncOrders()` uses first connected store and creates orders without `storeId`. | Shopify orders can be imported into the wrong tenant or remain orphaned from any tenant. | Implement `syncOrdersForStore(storeId)` and persist `storeId`. |
| Inventory sync | Inventory reads/writes call first-connected-store Admin helpers. | Stock levels and Shopify inventory adjustments can affect the wrong merchant. | Require storeId on inventory service APIs and use store-specific location IDs. |
| Inventory webhook lookup | `handleInventoryUpdate()` matches `inventory_item_id` against `variants.id`. | Current inventory-level webhook updates likely match zero products and are silently dropped. | Hotfix the lookup to `variants.inventoryItemId`, then add storeId filtering after Product tenancy. |
| Scheduled jobs | Background full/incremental/inventory jobs are global. | One scheduled job can use one store's credentials and update all stores' sync metadata. | Iterate connected stores explicitly with per-store status and locking. |
| Webhooks | No active HMAC verification or shop-domain mapping. | Spoofed or valid cross-shop webhooks can mutate global data. | Add verified webhook tenant resolver before handlers. |
| Webhook health endpoint | `GET /api/webhooks/health` is public and unauthenticated. | Low direct risk, but it confirms webhook infrastructure and path prefix. | Explicitly document, rate-limit, or move it if public exposure is not intended. |
| Product model | No Product `storeId`; global unique Shopify IDs/handles/slugs. | Tenant-scoped product writes cannot be implemented safely without schema/index work. | Add Product tenancy migration before product webhook/sync fixes. |
| `ShopifyOrderSyncService` | Reads order `storeId`, but does not decrypt encrypted tokens. | Safer tenant selection, but token handling can fail for encrypted tokens. | Reuse the store-scoped Admin client or shared token resolver. |

## Recommended implementation sequence

1. Hotfix current inventory webhook lookup.
   - Match Shopify `inventory_item_id` against `variants.inventoryItemId`.
   - Add a regression test proving inventory-level webhooks update the intended variant.
   - Keep this fix narrow and separate from Product tenancy/index migrations.

2. Add a Shopify webhook tenant resolver.
   - Configure raw-body parsing for `/api/webhooks/shopify/*`.
   - Verify `X-Shopify-Hmac-Sha256`.
   - Resolve `X-Shopify-Shop-Domain` through `Store.findByShopifyShop()`.
   - Attach trusted `storeId` to the request context and reject unknown shops.

3. Add Product tenancy before product sync/webhook rewrites.
   - Add `storeId` to Product.
   - Replace global unique Shopify/product handle/slug constraints with store-scoped compound indexes.
   - Backfill or migration-plan existing Product records before enabling multi-store writes.

4. Replace legacy Admin helpers with store-scoped APIs.
   - Add `syncProductsForStore(storeId)`, `syncProductForStore(storeId, ...)`, `syncCustomersForStore(storeId)`, `syncOrdersForStore(storeId)`, `getInventoryLevelsForStore(storeId, ...)`, `updateInventoryForStore(storeId, ...)`, and `createOrderForStore(storeId, ...)`.
   - Route new runtime code through `getShopifyClientForStore(storeId)`.
   - Leave `getShopifyClient()` only as an explicit single-tenant/development compatibility helper, or remove it after call sites are migrated.

5. Store-scope manual and scheduled sync.
   - Make authenticated sync routes use the user's validated store context.
   - Make background jobs iterate connected stores one at a time.
   - Track sync status and `lastSyncAt` per store instead of one global in-memory status.

6. Store-scope webhook handlers.
   - Product create/update/delete should query and write by `{ storeId, shopifyProductId }`.
   - Order create/update/paid should query and write by `{ storeId, shopifyOrderId }`.
   - Customer create/update should query and write by `{ storeId, email }` or `{ storeId, shopifyCustomerId }`.
   - Inventory updates should match `{ storeId, 'variants.inventoryItemId': inventory_item_id }`.

7. Harden order sync after checkout/payment-sensitive paths have their own ticket.
   - Reuse `getShopifyClientForStore()` or shared decrypted token resolution in `ShopifyOrderSyncService`.
   - Confirm every order creation path persists `storeId` before Shopify draft-order or inventory sync runs.

## Follow-up implementation issues recommended

1. Hotfix Shopify inventory webhook lookup.
   - Acceptance criteria: `handleInventoryUpdate` matches `inventory_item_id` against `variants.inventoryItemId`, a valid inventory-level webhook updates the intended variant, and the handler no longer silently drops every update because of an identifier mismatch.

2. Implement verified Shopify webhook tenant mapping.
   - Acceptance criteria: missing/invalid HMAC rejected, unknown shop rejected, valid webhook resolves one Store, handlers receive trusted `storeId`, and no handler writes before mapping succeeds.

3. Add Product `storeId` and store-scoped Shopify product identifiers.
   - Acceptance criteria: Product has `storeId`, duplicate Shopify product IDs/handles/slugs are allowed across different stores but not within one store, and existing product reads still work after migration.

4. Refactor Shopify Admin sync helpers to require storeId.
   - Acceptance criteria: sync product/customer/order helpers accept `storeId`, use `getShopifyClientForStore(storeId)`, and no production sync path calls first-connected-store `getShopifyClient()`.

5. Store-scope inventory sync and manual inventory endpoints.
   - Acceptance criteria: inventory sync/update APIs require trusted store context, use the correct store's Admin token and location ID, and update only products owned by that store.

6. Store-scope Shopify order/customer import and webhook writes.
   - Acceptance criteria: order/customer sync and webhook handlers use `{ storeId, shopify...Id }` or `{ storeId, email }`, persist `storeId`, and cannot merge records across merchants.

7. Harden `ShopifyOrderSyncService` token handling.
   - Acceptance criteria: draft order, inventory, complete, delete, and update operations use decrypted store-specific Admin credentials and have tests for encrypted-token stores.

8. Replace global sync status with per-store sync status.
   - Acceptance criteria: scheduled and manual sync update only the target store's `lastSyncAt`, expose per-store in-progress/error status, and do not mark all connected stores after one store sync.

## Tests needed

- Webhook verification tests for missing HMAC, invalid HMAC, valid raw-body HMAC, missing shop domain, unknown shop domain, and known shop domain.
- Webhook route tests covering the intended public/private behavior of `GET /api/webhooks/health`, including whether it remains public, rate-limited, and minimal.
- Webhook handler tests proving Product/User/Order writes include the resolved storeId and reject cross-store duplicate Shopify identifiers.
- Inventory webhook regression tests proving `inventory_item_id` matches `variants.inventoryItemId` and updates the intended variant instead of silently matching zero products.
- Product model/index migration tests proving duplicate Shopify IDs and handles can exist in different stores but not in the same store.
- Admin helper unit tests proving store-scoped helpers use the requested store's shop and token, and production sync helpers do not call first-connected-store `getShopifyClient()`.
- Sync service tests proving full and incremental sync operate per store, update only that store's sync timestamp, and do not mutate global Product/User/Order records.
- Inventory service tests proving inventory reads/writes use the requested store's Admin token and location ID, and bulk/all-product sync only touches the requested store.
- Order sync tests proving missing `order.storeId` skips Shopify work, encrypted tokens are decrypted, and draft/inventory/update/delete operations use the order's store.
- Route/background job tests proving manual sync routes require trusted store context and scheduled jobs iterate stores explicitly rather than relying on global helpers.

## Areas intentionally not touched

- Checkout and payment behavior.
- Order model redesign.
- Dashboard UI.
- Mobile app behavior.
- New webhook topics.
- Runtime refactors, migrations, or broad route rewiring.
