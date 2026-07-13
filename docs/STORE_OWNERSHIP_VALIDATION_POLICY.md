# Store Ownership Validation Policy

This audit documents the current store ownership behavior and the recommended policy for future enforcement. It is intentionally documentation-only; no runtime behavior changes are included.

> Update (2026-07-02, issue #67): enforcement extended per the implementation plan below. `requireOwnedStoreContext` (in `src/middleware/storeOwnership.ts`) validates supplied store IDs from params/query/body/`X-Store-ID` against the authenticated user's store, defaults to the user's own store when none is supplied, and implements the super-admin rule from item 4 (skip comparison **and** set `req.storeId` from the requested source). It is wired into all order management routes (`/api/v1/admin/stores/:storeId/orders*` via `requireOwnedStoreParam`, the `/orders*` routes via `requireOwnedStoreContext`) and the storeId-accepting `adminRoutes` endpoints (`/sync/status`, `/shopify/fetch-location`, `/shopify/set-location`, now also authenticated). Order controllers use the validated `req.storeId` only, and `:orderId` lookups are store-scoped. Remaining `adminRoutes` endpoints without store inputs still have auth disabled, and admin analytics remains globally scoped — both are follow-up work.

> Update (2026-07-07, issue #79; auth restored earlier by issue #75): admin analytics and dashboard aggregates are now store-scoped. Every admin route on `analyticsRoutes` (combined/legacy dashboards, sales, customers, orders, inventory, app engagement/journeys) and the aggregate `adminRoutes` endpoints (`/dashboard`, `/system/stats`, `/logs`, `/inventory/overview`, `/inventory/reservations`, `/help-requests*`) run behind `requireOwnedStoreContext({ required: false })`: store admins are always bound to their own store (any other supplied store gets 403), and the platform-wide aggregate exists only for super admins who omit the store. Documents without their own `storeId` (`ProductView`, `ProductReview`) are scoped through the owning product's store via `$lookup`; aggregation `$match` stages cast the id to an ObjectId explicitly (a raw string silently matches nothing). The DAU/MAU endpoints (`/app-stats`, `/app-engagement`) have no platform-wide mode and return 400 when a super admin omits the store. Session journeys are store-scoped so session IDs cannot be guessed across stores.

> Update (2026-07-09, issue #101): dashboard/admin route ownership coverage was audited across `src/routes` and related controllers/services. Store-admin `:storeId` route groups are wired through `requireOwnedStoreParam()` or an equivalent authenticated `storeAuth`/`req.storeId` pattern, aggregate dashboard/analytics routes use `requireOwnedStoreContext({ required: false })` with explicit super-admin global behavior, and intentionally public routes are limited to storefront/customer-entry/telemetry/health/webhook callback surfaces documented below. One ownership gap was fixed in `src/routes/shopifyRoutes.ts`: authenticated Shopify admin tooling routes now require admin/super-admin role and `requireOwnedStoreContext()`, then scope overview counts, product sync status, low-stock inventory, inventory history, product analytics, SEO enhancement, and image optimization to the validated store. Regression coverage in `tests/shopifyRoutesAdminOwnership.test.ts` proves store A admins cannot see store B product/order summaries or product analytics through those routes, and super admins can target a store explicitly.

> Update (2026-07-13, issue #110): Shopify sync status now uses per-store in-memory status keyed by the validated store context. Store admins see only their own sync timestamps/errors/stats through `/api/v1/shopify/sync/status`, `/api/v1/shopify/overview`, admin dashboard/status, and store-admin sync status; super-admin platform aggregation is explicit only on admin routes that allow an omitted store context. `POST /api/v1/shopify/inventory/sync` now validates `productId` ownership with `{ _id, storeId }` before calling inventory sync and returns a controlled not-found response for missing or cross-store products instead of surfacing a generic 500 from deeper Shopify inventory logic. Durable sync status storage, distributed locks, background worker migration, live Shopify execution, checkout/payment behavior, dashboard UI, and mobile app changes remain outside this issue.

## Current Behavior

Global API requests pass through `strictStoreValidation`. That middleware accepts `X-Store-ID`, validates the ObjectId format, and sets `req.storeId` for guest requests. When an Authorization token is present, it tries to compare `decoded.storeId` with `X-Store-ID`, but currently issued JWTs contain `userId` only. For normal tokens, this means the global middleware cannot prove store ownership by token payload.

Customer authentication is stronger. `authenticateCustomer` and `optionalCustomerAuth` load the `Customer` record by `userId`, require an active customer, and set both `req.customer.storeId` and `req.storeId` from the database. Protected customer routes therefore use the customer's stored ownership instead of a caller-supplied store ID.

Dashboard/admin authentication is mixed. `requireStoreAdmin` uses `authenticate`, `storeAuth`, and `storeAdmin`, then sets `req.storeId` from the authenticated `User` record. Routes that rely on this pattern are bound to the user's store. Other admin route groups use `authenticate` plus role authorization and then read `:storeId`, query `storeId`, body `storeId`, or `X-Store-ID` directly in controllers.

Public storefront endpoints intentionally accept a supplied store ID. This includes catalog/home/config/recommendation reads and public customer auth entry points where the store context is needed before a customer account exists.

Unified cart currently supports both guest and customer flows. Guest cart requests use supplied store context. Authenticated customer cart requests load the customer and set `req.storeId` from the database, but guest-cart merge still receives the originally supplied store ID and should be reviewed in a future implementation issue.

## Risks

- The global `strictStoreValidation` comment promises token-store binding, but current JWT payloads do not carry store ownership. The actual binding happens later only on routes that use customer or store admin middleware.
- `strictStoreValidation` silently falls back to the caller-supplied `X-Store-ID` header when the bearer token is malformed or expired. Its `catch` block sets `req.storeId = headerStoreId` and intentionally calls `next()` so that downstream auth middleware can reject the bad token. The consequence is that `req.storeId`, as set by the global layer alone, can originate from an untrusted header even when an (invalid) `Authorization` token is present. Future route-level ownership middleware must therefore not treat the global `req.storeId` as authoritative for authenticated contexts; it must re-derive and validate the effective store ID from the authenticated user/customer record.
- Admin routes that use `authenticate` plus role authorization without `storeAuth` can accept a caller-supplied `:storeId` and operate on that store if the controller does not compare it to `req.user.storeId`.
- Routes with `:storeId` parameters are easy to misread as tenant-scoped because queries include `storeId`, but query scoping is not the same as proving the authenticated user owns that store.
- Public endpoints must continue to accept store IDs, so future enforcement needs route-level policy rather than a blanket rejection of supplied store IDs.
- Some endpoints use `req.storeId`, some use params, and some use helper fallback order. This creates inconsistent expectations for future contributors.

## Recommended Policy

Use the following store context rules:

1. Public storefront read access may accept `X-Store-ID` or `storeId` when the endpoint returns public, read-only store data.
2. Customer-authenticated routes must ignore caller-supplied store IDs for authorization and use `Customer.storeId` loaded from the authenticated customer record.
3. Admin/staff routes must use a shared ownership middleware that compares the effective store ID to the authenticated `User.storeId`.
4. Super admin access should be the only exception that can operate across stores, and that exception should be explicit in the middleware or route metadata. A super admin bypass must do two things, not one: skip the ownership comparison **and** set the effective `req.storeId` from the declared route source (for example `req.params.storeId`). It must not retain the super admin's own `User.storeId`. Note that the existing `storeAuth` middleware always sets `req.storeId` from the authenticated user's own record, so any super admin cross-store path that runs through `storeAuth` (for example `requireSuperAdmin = [authenticate, storeAuth, superAdmin]`) will silently scope to the admin's own store unless the new middleware deliberately overwrites `req.storeId` with the requested store ID.
5. Controllers should not perform ownership decisions from raw `req.params.storeId`, `req.query.storeId`, `req.body.storeId`, or `X-Store-ID` after authentication. They should use a validated effective store ID set by middleware.
6. JWTs should not become the source of truth for ownership unless token issuance and refresh behavior are intentionally redesigned. Database-backed user/customer records should remain authoritative for the next implementation step.

## Public Store ID Routes

These routes should continue to allow supplied store context, with ObjectId and active-store validation where practical:

- Public catalog and product discovery routes such as products, collections, search, homescreen, carousel, category grid, collection displays, promo banners, callout banners, collection showcases, and recommendations.
- Public mobile store configuration at `GET /api/v1/store/config`.
- Customer registration and login, because the customer account lookup is store-scoped before authentication exists.
- Guest unified-cart routes, because guest sessions are store-scoped before customer authentication exists.
- Analytics/event tracking endpoints that intentionally accept anonymous app events, provided they remain write-limited to low-risk telemetry and do not expose store data.
- Public health/status surfaces such as `/api/health`, `/api/ready`, and the minimal Shopify OAuth/webhook callback/health surfaces that must be reachable by infrastructure or Shopify before application authentication exists.

## Routes That Must Bind Authenticated Users To Store ID

Customer-owned routes must bind to `Customer.storeId`:

- Customer profile, addresses, wishlists, reviews, product interactions, notifications, data export, and authenticated unified-cart operations.
- Customer order routes are intentionally not changed by this issue, but future ownership enforcement should continue to bind them to `Customer.storeId`.

Admin/staff routes must bind `:storeId` or any supplied store ID to the authenticated `User.storeId` unless the user is an explicit super admin:

- Store settings and branding: `/api/v1/admin/stores/:storeId/settings` and `/api/v1/admin/stores/:storeId/branding`.
- Customer management: `/api/v1/admin/stores/:storeId/customers...`.
- Security audit and request stats: `/api/v1/admin/stores/:storeId/security...`.
- Abandoned cart admin endpoints under `/api/v1/admin/stores/:storeId/...`.
- Email configuration endpoints under `/api/v1/admin/stores/:storeId/email...`.
- Compliance export/delete endpoints under `/api/v1/stores/:storeId/compliance...`.
- Store admin sync status at `/api/v1/stores/:storeId/admin/sync/status`.
- Push notification admin endpoints under `/api/v1/notifications/stores/:storeId/...`.
- Admin analytics and dashboard endpoints should consistently use store-bound middleware before reading store-scoped analytics.
- Shopify admin tooling under `/api/v1/shopify/...` must use the authenticated user's store context for store-owned product/order/inventory data and Shopify Admin operations. Store admins cannot use a product ID from another store to read analytics, inventory history, sync status, or trigger product actions.

## Dashboard/Admin Route Audit Findings (Issue #101)

| Route area | Ownership classification | Current finding |
| --- | --- | --- |
| `adminRoutes` (`/api/v1/admin/dashboard`, sync status, system stats/logs, inventory overview/reservations, help requests) | Store-admin with explicit super-admin aggregate mode | Router-level `authenticate` + `authorize('admin', 'super_admin')`; store-owned aggregate reads use `requireOwnedStoreContext({ required: false })`. Super admins may omit store context for platform aggregates; store admins are bound to their own store. |
| `analyticsRoutes` admin endpoints | Store-admin with explicit super-admin aggregate mode | Admin analytics run behind `authenticateAdmin` and `requireOwnedStoreContext({ required: false })`; public event/session write endpoints remain unauthenticated telemetry and do not return tenant data. |
| `storeSettingsRoutes`, `storeBrandingRoutes`, `customerManagementRoutes`, `orderManagementRoutes`, `securityRoutes`, `emailConfigRoutes`, `complianceRoutes`, `abandonedCartRoutes`, `pushNotificationRoutes`, `storeAdminRoutes` | Store-admin `:storeId` routes | Store-specific paths run through `requireOwnedStoreParam()` before controllers. Existing controllers query or mutate by the route store ID / validated request store context. |
| Home module admin routes (`carousel`, `promoBanner`, `calloutBanner`, `categoryGrid`, `collectionDisplay`, `collectionShowcase`, `categoryCollectionGrid`) | Store-admin `req.storeId` routes | Admin mutations require store context via the mounted admin/store middleware pattern and controllers scope reads/writes by `req.storeId`; issue #100 added owning-store Shopify collection validation before save/publish. |
| `shopifyRoutes` (`/api/v1/shopify/...`) | Store-admin Shopify/Admin tooling | Issue #101 fixed unscoped authenticated reads/actions. Routes now require admin/super-admin role plus `requireOwnedStoreContext()`: store admins default to their own store and cannot override it, while super admins must explicitly supply a target store. Overview counts, product sync status, inventory/product detail reads, product actions, sync, inventory updates, and Admin connection checks use that validated store. Issue #110 additionally scopes in-memory sync status/overview sync data to that store and validates `/inventory/sync` product ownership before inventory sync. |
| Shopify OAuth callback and webhook POST handlers | Public callback/webhook with separate tenant proof | OAuth callback resolves store identity from the signed state token; Shopify webhooks verify HMAC and resolve trusted store context before handlers run. They are intentionally not protected by dashboard auth. |
| `/api/health`, `/api/ready`, public storefront/customer-entry routes, public analytics event writes | Intentionally public or public store-context routes | These routes must remain reachable without dashboard auth. Public storefront/customer routes may accept supplied store context only for public data or pre-auth account lookup; they are outside dashboard/admin ownership controls. |

No checkout/payment behavior, dashboard frontend code, mobile code, migrations, live Shopify credentials, or broad auth/JWT design was changed by issue #101.

Routes already using `requireStoreAdmin` are closer to the target policy because `storeAuth` sets `req.storeId` from the authenticated user record. Future work should still verify that controllers do not accidentally trust a conflicting route parameter or body store ID.

## Proposed Implementation Plan

1. Add a shared middleware such as `requireOwnedStoreParam` for admin/staff routes. It should run after `authenticate`, load the authenticated user's store ID, compare it to `req.params.storeId` (or another declared source), and on a match set a normalized `req.storeId` from that requested store ID. For non-super-admins a mismatch returns 403. When an explicit `super_admin` bypass is intended, the middleware must skip the comparison **and** set `req.storeId` from the requested route source rather than from `req.user.storeId`; otherwise cross-store access silently scopes back to the admin's own store. Because the current `storeAuth` already overwrites `req.storeId` with the user's own store, this new middleware should either replace `storeAuth` on these routes or run after it and deliberately re-set `req.storeId`.
2. Add a public store context middleware for public storefront routes. It should extract a store ID, validate ObjectId format, optionally require active stores for mobile-facing data, and avoid implying authenticated ownership.
3. Update admin route groups that currently use only `authenticate` and role authorization to use the shared ownership middleware before controllers read `:storeId`.
4. Standardize controller expectations so authenticated controllers use `req.storeId` and public controllers use a clearly named public context helper.
5. Revisit `strictStoreValidation` after route-level middleware exists. It can remain a format guard and request context helper, but it should not claim to prove token ownership unless JWT issuance changes.
6. Create a follow-up issue for implementation, limited to middleware and route wiring, with no checkout, Stripe, order, Shopify client, webhook, dashboard, mobile, or deployment changes unless explicitly scoped.

## Suggested Future Tests

- Customer token with a mismatched `X-Store-ID` still accesses only the customer's own store on protected customer routes.
- Customer token cannot access another customer's store-scoped data by supplying a different `storeId` in query, body, or header.
- Admin user with store A receives 403 when calling a store B `:storeId` admin route.
- Admin user with store A succeeds on the same route when `:storeId` is store A.
- Explicit super admin behavior is tested for whichever cross-store routes are allowed. Specifically, a super admin calling a store B `:storeId` route receives store B's data (asserting the response is scoped to the requested store, not the admin's own store), confirming `req.storeId` is set from the route source and not from `User.storeId`.
- A request carrying an invalid or expired bearer token together with an `X-Store-ID` header is not treated as authenticated by route-level ownership middleware; the request is rejected by auth rather than served using the header-derived `req.storeId`.
- Public catalog/config routes continue to work for valid active store IDs without authentication.
- Public routes reject missing or malformed store IDs without changing existing response shape expectations.
- Guest cart remains scoped to the supplied store ID, while authenticated cart operations use the customer's stored store ID.

## Follow-Up Recommendation

Open a focused implementation issue to add shared store ownership middleware and wire it into admin/staff routes that currently accept `:storeId` under role-only auth. Keep that implementation separate from login/JWT issuance, refresh tokens, checkout, Stripe, orders, Shopify clients, webhooks, dashboard, mobile app, and deployment.
