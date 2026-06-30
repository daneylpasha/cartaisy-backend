# Store Ownership Validation Policy

This audit documents the current store ownership behavior and the recommended policy for future enforcement. It is intentionally documentation-only; no runtime behavior changes are included.

## Current Behavior

Global API requests pass through `strictStoreValidation`. That middleware accepts `X-Store-ID`, validates the ObjectId format, and sets `req.storeId` for guest requests. When an Authorization token is present, it tries to compare `decoded.storeId` with `X-Store-ID`, but currently issued JWTs contain `userId` only. For normal tokens, this means the global middleware cannot prove store ownership by token payload.

Customer authentication is stronger. `authenticateCustomer` and `optionalCustomerAuth` load the `Customer` record by `userId`, require an active customer, and set both `req.customer.storeId` and `req.storeId` from the database. Protected customer routes therefore use the customer's stored ownership instead of a caller-supplied store ID.

Dashboard/admin authentication is mixed. `requireStoreAdmin` uses `authenticate`, `storeAuth`, and `storeAdmin`, then sets `req.storeId` from the authenticated `User` record. Routes that rely on this pattern are bound to the user's store. Other admin route groups use `authenticate` plus role authorization and then read `:storeId`, query `storeId`, body `storeId`, or `X-Store-ID` directly in controllers.

Public storefront endpoints intentionally accept a supplied store ID. This includes catalog/home/config/recommendation reads and public customer auth entry points where the store context is needed before a customer account exists.

Unified cart currently supports both guest and customer flows. Guest cart requests use supplied store context. Authenticated customer cart requests load the customer and set `req.storeId` from the database, but guest-cart merge still receives the originally supplied store ID and should be reviewed in a future implementation issue.

## Risks

- The global `strictStoreValidation` comment promises token-store binding, but current JWT payloads do not carry store ownership. The actual binding happens later only on routes that use customer or store admin middleware.
- Admin routes that use `authenticate` plus role authorization without `storeAuth` can accept a caller-supplied `:storeId` and operate on that store if the controller does not compare it to `req.user.storeId`.
- Routes with `:storeId` parameters are easy to misread as tenant-scoped because queries include `storeId`, but query scoping is not the same as proving the authenticated user owns that store.
- Public endpoints must continue to accept store IDs, so future enforcement needs route-level policy rather than a blanket rejection of supplied store IDs.
- Some endpoints use `req.storeId`, some use params, and some use helper fallback order. This creates inconsistent expectations for future contributors.

## Recommended Policy

Use the following store context rules:

1. Public storefront read access may accept `X-Store-ID` or `storeId` when the endpoint returns public, read-only store data.
2. Customer-authenticated routes must ignore caller-supplied store IDs for authorization and use `Customer.storeId` loaded from the authenticated customer record.
3. Admin/staff routes must use a shared ownership middleware that compares the effective store ID to the authenticated `User.storeId`.
4. Super admin access should be the only exception that can operate across stores, and that exception should be explicit in the middleware or route metadata.
5. Controllers should not perform ownership decisions from raw `req.params.storeId`, `req.query.storeId`, `req.body.storeId`, or `X-Store-ID` after authentication. They should use a validated effective store ID set by middleware.
6. JWTs should not become the source of truth for ownership unless token issuance and refresh behavior are intentionally redesigned. Database-backed user/customer records should remain authoritative for the next implementation step.

## Public Store ID Routes

These routes should continue to allow supplied store context, with ObjectId and active-store validation where practical:

- Public catalog and product discovery routes such as products, collections, search, homescreen, carousel, category grid, collection displays, promo banners, callout banners, collection showcases, and recommendations.
- Public mobile store configuration at `GET /api/v1/store/config`.
- Customer registration and login, because the customer account lookup is store-scoped before authentication exists.
- Guest unified-cart routes, because guest sessions are store-scoped before customer authentication exists.
- Analytics/event tracking endpoints that intentionally accept anonymous app events, provided they remain write-limited to low-risk telemetry and do not expose store data.

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

Routes already using `requireStoreAdmin` are closer to the target policy because `storeAuth` sets `req.storeId` from the authenticated user record. Future work should still verify that controllers do not accidentally trust a conflicting route parameter or body store ID.

## Proposed Implementation Plan

1. Add a shared middleware such as `requireOwnedStoreParam` for admin/staff routes. It should run after `authenticate`, load or use the authenticated user's store ID, compare it to `req.params.storeId` or another declared source, allow explicit `super_admin` bypass when intended, and set a normalized `req.storeId`.
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
- Explicit super admin behavior is tested for whichever cross-store routes are allowed.
- Public catalog/config routes continue to work for valid active store IDs without authentication.
- Public routes reject missing or malformed store IDs without changing existing response shape expectations.
- Guest cart remains scoped to the supplied store ID, while authenticated cart operations use the customer's stored store ID.

## Follow-Up Recommendation

Open a focused implementation issue to add shared store ownership middleware and wire it into admin/staff routes that currently accept `:storeId` under role-only auth. Keep that implementation separate from login/JWT issuance, refresh tokens, checkout, Stripe, orders, Shopify clients, webhooks, dashboard, mobile app, and deployment.
