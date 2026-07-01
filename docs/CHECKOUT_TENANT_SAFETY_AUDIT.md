# Checkout Tenant-Safety Audit

GitHub issue: #48 - Audit checkout strategy and tenant-safety before implementation.

Last audited: 2026-07-01.

## Scope and method

This audit documents the current checkout flow and recommends a SaaS-safe checkout direction. It is intentionally documentation-only and does not change checkout, payment capture, Stripe behavior, order creation, tax, shipping, mobile app behavior, production credentials, or runtime Shopify client behavior.

Reviewed areas:

- `src/controllers/checkoutController.ts`
- `src/controllers/cartController.ts`
- `src/services/shopifyStorefrontService.ts`
- `src/services/shopifyOrderSyncService.ts`
- `src/services/shopifyService.ts`
- `src/services/stripeService.ts`
- `src/services/orderService.ts`
- `src/services/inventoryService.ts`
- `src/models/CheckoutSession.ts`
- `src/models/Order.ts`
- `src/models/Customer.ts`
- `src/authentication.ts`
- `src/middleware/strictStoreValidation.ts`
- Existing SaaS, tenant, Shopify, architecture, status, and prior audit docs.

Commands used during the audit:

- `rg -n "checkout|CheckoutController|completeCheckout|initializeCheckout|shipping-rates|apply-promo|remove-promo|shopifyStorefront\.|getCart\(|updateCartBuyerIdentity|applyDiscountCodes|createDraftOrder|completeDraftOrder|SHOPIFY_|process\.env\.SHOPIFY|getShopifyClient\(" src docs --glob '!public/swagger.json'`
- `rg -n "new CheckoutSession|CheckoutSession\.|findActiveByUser|findByCartId|shopifyCartId|Customer\.find|Order\.find|Product\.findOne|CartActivity\.markCheckout" src/controllers/checkoutController.ts src/models/CheckoutSession.ts src/services src/controllers`
- `rg -n "STRIPE|stripe|process\.env\.STRIPE|STORE_CURRENCY|SHOPIFY" src/services/stripeService.ts src/controllers/checkoutController.ts src/config src/models`
- `rg -n "getCartForStore|applyDiscountCodesForStore|updateCartBuyerIdentityForStore|createCartForStore|getStorefrontClientForStore" src/services/shopifyStorefrontService.ts src/controllers tests`

## Executive summary

The current checkout implementation is a native Stripe checkout that uses Shopify Storefront carts for cart pricing, discount code application, shipping options, and tax estimates, then creates a local `Order` after Stripe succeeds. It does not complete Shopify-hosted checkout and does not create a Shopify order during checkout completion. Inventory is adjusted afterward through `ShopifyOrderSyncService.updateInventory`.

This is not SaaS-safe as the default checkout path today. The checkout controller still calls the global Storefront cart helpers (`getCart`, `updateCartBuyerIdentity`, and `applyDiscountCodes`) without a store-specific Storefront client. Checkout sessions also do not persist `storeId`, so later steps cannot independently prove which merchant owns the cart, session, Stripe payment, local order, product mapping, or Shopify sync.

Recommended SaaS default: Shopify-hosted checkout, using a tenant-scoped Storefront cart and the cart `checkoutUrl` as the customer handoff. Keep the current native Stripe flow only as a temporary legacy or single-store transition path until it has a separate, focused tenant-safety implementation plan.

## Current Checkout Flow

| Step | Endpoint or code path | Current behavior | Shopify usage | Tenant-safety status |
| --- | --- | --- | --- | --- |
| Cart creation and mutation before checkout | `CartController` | Cart APIs resolve store context from authenticated request data, `request.storeId`, or header, then call `createCartForStore`, `getCartForStore`, and line mutation `*ForStore` methods. | Tenant-scoped Storefront helper. | Mostly aligned with SaaS direction for cart operations. |
| Checkout init | `POST /api/v1/checkout/init` | Authenticated user submits `cartId`. Controller fetches the cart, verifies it has lines, then creates `CheckoutSession` with `userId`, `shopifyCartId`, subtotal, currency, and status. | Calls `shopifyStorefront.getCart(cartId)`. | Not tenant-safe: global Storefront credentials and no persisted `storeId`. |
| Shipping rates | `GET /api/v1/checkout/shipping-rates` | Loads session by ID, verifies `session.belongsToUser(userId)`, loads the user's selected address, updates cart buyer identity, and returns delivery options. | Calls `shopifyStorefront.updateCartBuyerIdentity(...)`. | Not tenant-safe: global Storefront mutation and no session store check. |
| Save shipping | `POST /api/v1/checkout/save-shipping` | Repeats buyer identity update, selects a delivery option by handle, saves shipping cost and Shopify tax estimate into the session. | Calls `shopifyStorefront.updateCartBuyerIdentity(...)`. | Not tenant-safe: global Storefront mutation. |
| Save payment method | `POST /api/v1/checkout/step2` | Requires a saved Stripe customer/payment method for regular cards and verifies the payment method belongs to the user's Stripe customer. | None. | Tenant model is undefined for SaaS payments; Stripe is process-configured. |
| Promo apply/remove | `POST /api/v1/checkout/apply-promo`, `DELETE /api/v1/checkout/remove-promo` | Applies or clears discount codes on the Shopify cart, recalculates pricing from the cart/session, and saves discount data on the session. | Calls `shopifyStorefront.applyDiscountCodes(...)` and `shopifyStorefront.getCart(...)`. | Not tenant-safe: global Storefront credentials decide which shop receives the discount mutation. |
| Summary | `GET /api/v1/checkout/summary/:sessionId` | Loads session, user address, Stripe payment details, and Shopify cart lines for review. | Calls `shopifyStorefront.getCart(...)`. | Not tenant-safe: global Storefront read. |
| Complete checkout | `POST /api/v1/checkout/complete` | Confirms Stripe payment, fetches Shopify cart lines, creates a local `Order`, updates inventory through `ShopifyOrderSyncService.updateInventory`, marks session complete, clears `Customer.shopifyCartId`, and returns local order/payment data. | Calls `shopifyStorefront.getCart(...)`; `ShopifyOrderSyncService.updateInventory(...)` uses Admin REST through the order `storeId` if present. | High risk: payment, order, cart, product mapping, and inventory updates are not fully tied to a required checkout `storeId`. |

Important observed mismatch: `checkoutController.ts` comments describe creating and completing Shopify draft orders, and `shopifyStorefrontService.ts` contains global Admin GraphQL draft-order helpers, but checkout completion currently creates only a local `Order` and calls inventory sync. Draft order creation is available through other order management paths, not the checkout completion path audited here.

## Current Shopify Calls In Checkout

Storefront calls used directly by checkout:

| Call | Purpose | Store-scoped variant available today? | Used by checkout today? |
| --- | --- | --- | --- |
| `shopifyStorefront.getCart(cartId)` | Validate cart, fetch pricing, fetch line items for summary and completion. | `getCartForStore(storeId, cartId, countryCode)` exists. | No. Checkout uses the global call. |
| `shopifyStorefront.updateCartBuyerIdentity(cartId, address)` | Apply shipping address/country to get delivery options, shipping rates, and tax estimate. | No direct `updateCartBuyerIdentityForStore` was found. | No. Checkout uses the global call. |
| `shopifyStorefront.applyDiscountCodes(cartId, codes, countryCode)` | Apply or remove promo codes. | No direct `applyDiscountCodesForStore` was found. | No. Checkout uses the global call. |

Admin calls related to checkout/order behavior:

| Call | Purpose | Current checkout usage | Tenant-safety note |
| --- | --- | --- | --- |
| `ShopifyOrderSyncService.updateInventory(orderId)` | Adjusts Shopify inventory for each order line after local order save. | Called after local checkout order creation. | Uses `order.storeId` if present, but token handling does not decrypt encrypted Admin tokens. |
| `ShopifyOrderSyncService.createDraftOrder(orderId)` | Creates a Shopify draft order for a local order. | Not called by checkout completion. | Store-scoped by `order.storeId`, but not part of current checkout flow. |
| `shopifyStorefront.createDraftOrder(...)` and `completeDraftOrder(...)` | Global Admin GraphQL draft-order helpers. | Not called by checkout completion. | Use process-wide Admin credentials if called. |
| `shopifyService.createOrder(...)` | Legacy Admin REST order creation. | Not called by `checkoutController`; used by older `orderService` flow. | Uses legacy `getShopifyClient()`, which selects the first connected store. |

## Current Global Credential Usage

Checkout-adjacent process-wide credentials observed:

- `shopifyStorefrontService.ts` constructs a global Storefront client from `SHOPIFY_SHOP_DOMAIN` and `SHOPIFY_STOREFRONT_ACCESS_TOKEN`.
- `shopifyStorefrontService.ts` constructs a global Admin GraphQL client from `SHOPIFY_STORE_URL` and `SHOPIFY_ADMIN_ACCESS_TOKEN`.
- `checkoutController.ts` uses `STORE_CURRENCY` as fallback currency.
- `stripeService.ts` initializes a singleton Stripe client from `tenantConfig.payments.stripe.secretKey`, ultimately `STRIPE_SECRET_KEY`.
- `shopifyService.ts` exposes legacy Admin helpers through `getShopifyClient()`, which selects the first connected `Store`.

Global OAuth app credentials such as `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, and `SHOPIFY_SCOPES` are expected for the merchant connect flow and are not themselves the checkout tenant-safety problem. Runtime cart, checkout, order, and inventory calls must use credentials for the specific store being served.

## Tenant-Safety Risks

| Risk | Current evidence | Impact |
| --- | --- | --- |
| Checkout Storefront operations can hit the wrong Shopify shop. | Checkout calls global `getCart`, `updateCartBuyerIdentity`, and `applyDiscountCodes`. | Wrong merchant cart, shipping, tax, discount, or line items can influence payment and order creation. |
| Checkout sessions do not persist `storeId`. | `CheckoutSession` stores `userId`/`customerId` and `shopifyCartId`, but no tenant boundary field. The controller creates sessions with `userId` even for customers. | Later checkout steps cannot prove the session, cart, and customer still belong to the same store without re-deriving context. |
| Product mapping during checkout completion is not store-scoped. | Checkout maps Shopify line items to MongoDB products with `Product.findOne({ shopifyProductId })` variants and no `storeId` filter. | Duplicate Shopify IDs or synced products across tenants can attach the wrong local product to an order/inventory update. |
| Orders can be created without a required store. | Checkout sets `storeId` only when `findUserOrCustomer` returns a customer store ID. Admin/web `User` checkout has no store ID. The `Order` schema makes `storeId` optional. | Orders, inventory, dashboard visibility, and later Shopify sync can become unscoped. |
| Native Stripe flow has no explicit tenant payment strategy. | Stripe uses a singleton platform secret key and stores `stripeCustomerId` on `User` or `Customer`. | SaaS ownership of payment accounts, merchant payouts, refunds, disputes, and compliance is undefined. |
| Stripe can succeed before downstream order and Shopify side effects finish. | Checkout confirms payment before local order save, customer stats update, cart clearing, and inventory sync. | Failures after capture can leave paid customers with partial local or Shopify state unless idempotency and recovery are designed. |
| Shopify order source of truth is unclear. | Checkout creates a local `Order` but not a Shopify order; inventory is updated separately. | Merchant fulfillment in Shopify, webhook reconciliation, refunds, cancellations, and customer order visibility can diverge. |
| Admin token handling in order sync may fail for encrypted tokens. | `ShopifyOrderSyncService.getShopifyClient` reads `store.shopify.accessToken` directly. | This is store-scoped but operationally brittle; encrypted production tokens may fail sync. |

## Recommended SaaS Checkout Direction

Use Shopify-hosted checkout as the default SaaS checkout path.

Recommended target behavior:

1. Mobile creates and mutates carts through tenant-scoped backend cart APIs.
2. Backend derives store context from the authenticated customer or a validated public store context for guest cart flows.
3. Backend fetches the tenant-scoped Shopify cart and returns a Shopify-hosted checkout URL.
4. Mobile opens that URL in a browser or approved in-app web surface.
5. Shopify owns payment capture, shipping/tax calculation, discount validation, and Shopify order creation.
6. Backend receives Shopify webhooks, maps orders to the correct `Store` and customer/cart metadata, then exposes order status to mobile.

Why this should be the default:

- It avoids implementing custom payment capture, tax, shipping, discount, and Shopify order creation in the backend before tenant boundaries are complete.
- It uses Shopify as the order/payment source of truth for Shopify merchants.
- It avoids shipping Shopify private credentials to mobile clients.
- It keeps the MVP away from Shopify Plus or custom checkout assumptions.
- It creates a smaller implementation surface: tenant-scoped cart checkout URL plus order webhook reconciliation.

Native Stripe checkout should not be the default SaaS path until a separate implementation issue answers the merchant payment model, Stripe account strategy, order source of truth, idempotency, refund/cancellation flow, tax/shipping parity, and tenant-scoped Shopify Admin/Storefront requirements.

Hybrid/transition mode is acceptable only as a controlled bridge:

- Default new SaaS stores to Shopify-hosted checkout.
- Keep current native Stripe checkout disabled in SaaS/prod or limited to explicit legacy/single-store environments.
- Do not route tenant SaaS customers through native Stripe checkout until it is store-scoped end to end.

## Required Backend Changes

For Shopify-hosted checkout:

1. Add a tenant-scoped checkout start endpoint that derives `storeId` from authenticated customer context or validated guest/public context.
2. Fetch the cart through `getCartForStore(storeId, cartId, countryCode)` or a shared store-scoped client.
3. Include Shopify cart `checkoutUrl` in the Storefront cart query/response, or add a narrow Storefront helper that fetches it for a store-scoped cart.
4. Persist checkout handoff metadata with `storeId`, `customerId` or guest session ID, `shopifyCartId`, and any non-sensitive correlation metadata needed for webhook reconciliation.
5. Add Shopify webhook reconciliation for order creation/payment completion, mapping each order to the correct `Store`.
6. Add tests proving checkout handoff cannot call global Storefront clients or proceed without store context.
7. Keep Admin tokens server-side and use store-specific credentials for any post-checkout Shopify Admin calls.

For any future native Stripe checkout:

1. Add required `storeId` and `customerId` fields to `CheckoutSession` and scope active-session lookups by store.
2. Replace every checkout Storefront call with store-scoped equivalents, including buyer identity and discount mutations.
3. Scope product lookup by `storeId` when mapping Shopify cart lines to local products.
4. Require `storeId` on checkout-created orders.
5. Decide whether Stripe is Cartaisy-platform, merchant-owned Stripe Connect, or another approved payment model.
6. Add idempotency around payment intent creation, confirmation, order creation, inventory sync, and retry/recovery.
7. Define refund, cancellation, webhook, dispute, receipt, and payout behavior before production use.

## Required Mobile Changes

For Shopify-hosted checkout:

1. Use backend cart APIs to create/update carts and receive a cart/checkout handoff response.
2. Replace the native multi-step payment flow as the default with opening the returned Shopify checkout URL.
3. Handle checkout return/deep-link behavior and show a pending or confirmed order state based on backend order sync.
4. Keep Shopify Admin tokens, Storefront tokens, OAuth secrets, Stripe secrets, and webhook secrets out of the app.
5. Keep any native Stripe UI behind a feature flag or legacy mode until backend tenant-safety work explicitly supports it.

## Migration Steps

1. Leave current runtime checkout behavior unchanged while this audit is reviewed.
2. Add a small Shopify-hosted checkout handoff endpoint and tests.
3. Update mobile to use Shopify-hosted checkout for one test store.
4. Add Shopify order webhook reconciliation and order status visibility.
5. Run a first-merchant end-to-end test covering cart, checkout, payment, Shopify order creation, webhook sync, and mobile order status.
6. Disable or hide native Stripe checkout for SaaS stores until a separate native checkout issue is completed.
7. Decide later whether native Stripe checkout is worth implementing as a store-scoped paid feature or should remain out of MVP.

## Proposed Follow-Up Tickets

1. Create tenant-scoped Shopify-hosted checkout handoff.
   - Add a backend endpoint that resolves store context, validates the cart through store-scoped Storefront credentials, and returns Shopify `checkoutUrl`.
   - Add tests that fail if checkout handoff calls global Storefront helpers.

2. Add Shopify order webhook reconciliation for mobile checkout.
   - Map Shopify orders back to `Store`, customer or guest session, cart ID, and local order records.
   - Document order source of truth, idempotency keys, retry behavior, and customer order visibility.

3. Gate or disable native Stripe checkout for SaaS stores.
   - Add an explicit configuration flag or route guard so SaaS/prod cannot accidentally use the current native Stripe path.
   - Keep single-store/dev behavior separate if needed.

4. Plan native Stripe checkout tenant-safety if it remains required.
   - Scope `CheckoutSession`, Storefront calls, product mapping, order creation, Stripe customer/payment ownership, idempotency, refunds, and inventory sync by `storeId`.
   - Add targeted tests before enabling it for multi-tenant stores.

5. Harden store-scoped Shopify Admin order sync.
   - Decrypt encrypted store Admin tokens in `ShopifyOrderSyncService`.
   - Require `storeId` on checkout-created orders before any Shopify Admin sync runs.

## Areas Intentionally Not Touched

- Payment capture logic.
- Stripe payment behavior.
- Order creation behavior.
- Tax and shipping behavior.
- Mobile app implementation.
- Production credentials or environment configuration.
- Broad checkout refactor.
- Generated routes or OpenAPI output.

## No Behavior Changes

This audit adds documentation only. Existing checkout, cart, payment, order, Shopify, Stripe, tax, shipping, and mobile runtime behavior remains unchanged.
