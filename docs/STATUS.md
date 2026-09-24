# Backend Status

Last updated: 2026-09-24 (issue #163 operational Shopify webhooks).

This file is a human/agent-maintained snapshot, not an automatically guaranteed source of truth. Verify current behavior in code, tests, CI, and deployed environments before making implementation decisions.

Do not assume this exists unless verified in code.

## Current state

Current state: the backend has a broad Express/Mongoose implementation with mobile and dashboard/admin API areas, Shopify integration code, tenant-related middleware, docs/audits, tests, CI workflow files, and deployment workflow files.

## Target state

Target state: use this file to orient backend work quickly, then inspect the linked docs and source code before changing behavior.

## Known gaps

Known gap: status categories below are based on repo inspection and existing docs, not an exhaustive runtime audit.

| Area | Status | Notes |
| --- | --- | --- |
| SaaS tenancy | Partial | Store is the intended tenant boundary. Many models and routes include `storeId`; Product now has `storeId` with store-scoped unique indexes and a documented backfill (`docs/PRODUCT_TENANCY_MIGRATION.md`, issue #65). Legacy local product catalog list/search/featured/category/related/recommendation reads are store-scoped with regression coverage for cross-store isolation (issue #87). The backfill script's dry-run safety, fail-closed store resolution, and index reporting are test-covered and it prints the release-gate verification numbers (per-store counts, index state); Product/customer/order operator release gates and exact Mongo verification commands are in `docs/RELEASE_CHECKLIST.md` (issues #78 and #89). Issue #108 provided no operator staging evidence in the issue body or comments, so staging/production execution remains pending operator work; no staging backup, storeless Product/User/Order counts, product index verification, legacy global unique index status, or rollback notes have been recorded. Ownership policy docs identify routes and middleware patterns that need verification or follow-up. |
| Shopify integration | Partial | Tenant-scoped Storefront helper methods and tests exist for several mobile-facing paths. The legacy first-connected-store Admin helper `getShopifyClient()` is removed (issue #66): runtime sync/inventory/order/admin paths resolve credentials via `getShopifyClientForStore(storeId)` and fail closed without a trusted store context. Customer/order sync record matching is store-scoped (issue #77), but legacy storeless customer/order data backfill remains operator work. Issue #110 adds in-process per-store sync status for manual/scheduled sync results and admin status/overview reads. Issue #154 persists dashboard catalog sync status on the store (`idle`, `syncing`, `succeeded`, `failed`) with quiet in-request retries; distributed locking for the older in-memory admin sync map and a worker redesign remain future work. Issue #124 provisions the per-store Storefront API token: `createStorefrontAccessToken(storeId)` calls the Admin GraphQL `storefrontAccessTokenCreate` mutation with the store's own connected Admin credentials and persists the token to `Store.shopify.storefrontAccessToken` (that store only, no global env fallback). It is exposed as store-admin `POST /api/v1/shopify/storefront-token` (admin auth + `requireOwnedStoreContext()`) and invoked best-effort at the end of the OAuth callback (failure logs a warning and leaves the store Admin-connected). This closes the issue #116 gap where `getStorefrontClientForStore()` failed closed for Admin-connected stores; running the endpoint once against the staging store remains operator follow-up. Issue #153 (Phase 4 slice, parent epic #152) makes the backend the sole owner of Shopify access tokens for new connects: the dashboard contract is start (`POST /api/v1/shopify/oauth/connect`), callback, status, disconnect (Shopify revoke, then clear), and trigger sync (`POST /api/v1/shopify/sync`). Tokens stay encrypted on the store record and are not returned to clients. Historical dashboard-database tokens are not migrated in this slice. See `docs/cartaisy/SHOPIFY_API_POLICY.md` and `docs/DECISIONS.md`. Issue #165 removes the remaining mobile/dashboard request-path uses of process-wide Storefront/Admin env credentials: favorites hydration uses `getProductByIdForStore` with the authenticated account's store, cart line metafields are no longer read through the global Admin token, and singleton Storefront/Admin methods (`query`, `queryAdmin`, `isConfigured`, `isAdminConfigured`) fail closed when `SAAS_MODE`, `MULTI_TENANT_MODE`, or production is on. One-off scripts under `src/scripts/` still use env credentials and are operator-only. |
| Store ownership/security | Partial | Customer auth and store admin middleware derive store context from records. Order management and admin storeId-accepting routes now enforce ownership via `requireOwnedStoreParam`/`requireOwnedStoreContext` with explicit super-admin behavior (issue #67). All `adminRoutes` endpoints now require router-level authentication with admin/super-admin authorization (issue #75); no endpoint on that router is public (the unauthenticated health check remains `/api/health`). Admin analytics/dashboard/help-request queries are store-scoped via validated `req.storeId` (issue #79): store admins see only their own store's metrics, and the platform-wide aggregate exists only for super admins who omit the store. Dashboard/admin route ownership coverage was audited route-by-route for issue #101; the audit found and fixed unscoped Shopify admin tooling reads/actions under `/api/v1/shopify`, which now require admin/super-admin role plus `requireOwnedStoreContext()` and scope product/order/inventory data to the validated store. Issue #110 scopes Shopify sync status and overview sync data to the validated store, keeps admin platform sync status explicit for super admins who omit a store, and returns controlled not-found responses for cross-store inventory sync product IDs. `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` documents the policy and audit findings. |
| Home modules/config | Partial | Current home module models/controllers and response assembly are documented in `docs/HOME_MODULE_CONFIG_AUDIT.md`. Home module create/update and activation paths now validate configured Shopify collection IDs through the owning store's Storefront credentials and reject invalid or cross-store IDs with controlled 400 responses (issue #100). Remaining gaps include broader payload validation, dashboard picker ergonomics, image URL validation, and position/order normalization. |
| Mobile store config/branding | Partial | The public `GET /api/v1/store/config` endpoint (no auth, store identified by `X-Store-ID`) now returns `primaryColor`, `secondaryColor`, and `logoUrl` sourced from `Store.branding`, alongside the existing `currency`/`timezone`/`language`/`name` fields, which are unchanged. Branding values are re-validated on the way out: colors must match the schema's hex pattern and `logoUrl` must be a well-formed absolute `http`/`https` URL. Invalid or unset branding fields are omitted from the response rather than returned as `null`, so clients fall back to their own bundled defaults, and broken branding data never fails the request. Consuming this contract is now implemented on both sides: the mobile app applies `primaryColor`/`secondaryColor` live via Tamagui's `updateTheme` and renders `logoUrl` with a bundled fallback (`Cartaisy` repo PRs #115/#116), and the dashboard branding editor writes through this endpoint's backing model (`cartaisy-dashboard` PR #13). No live dashboard-edit → this endpoint → mobile-app run has been recorded end-to-end; each side's evidence today is independent (this contract's own tests, the mobile hooks' unit tests, the dashboard editor's manual verification), not a single connected trace — see `docs/cartaisy/ROADMAP.md` Phase 3. |
| Cart/checkout | Partial | Unified cart, cart, and guest/customer cart flows exist. Local unified-cart product mutations now verify submitted Product IDs belong to the trusted cart store, and guest-to-customer cart merge uses the authenticated customer's store context with regression coverage for cross-store product rejection (issue #88). Checkout strategy is decided and implemented as Shopify-hosted checkout handoff (`POST /api/v1/checkout/handoff`, issue #68): tenant-scoped Storefront `checkoutUrl` with fail-closed store context; legacy native Stripe checkout is gated off in production/SaaS mode. Order webhook reconciliation for handoff checkouts is implemented (issue #76): Shopify order webhooks create/update store-scoped local Orders, match the `CheckoutHandoff`, and attribute customers/guests per `docs/DECISIONS.md`. Any future native checkout tenant-safety remains follow-up work. Issue #165 leaves hosted checkout handoff unchanged and keeps legacy native checkout unreachable in SaaS/production; the underlying unscoped Storefront helpers also fail closed before any env credential is used. |
| Orders/customer account | Partial | Customer auth/account, addresses, wishlists, reviews, orders, order management, and customer management code exists. Local customer/order creation now verifies submitted Product IDs against the trusted store before order/inventory mutation, with cross-store rejection tests (issue #88). Tenant ownership and Shopify order sync paths still need careful verification. |
| Dashboard APIs | Partial | Admin, analytics, store settings, branding, customer management, order management, email, security, compliance, abandoned cart, notification, home module, Shopify OAuth, and Shopify admin tooling routes exist. Issue #101 verified the dashboard/admin ownership patterns: store-specific `:storeId` routes use `requireOwnedStoreParam()`, aggregate dashboard/analytics routes use `requireOwnedStoreContext({ required: false })` with explicit super-admin platform-wide behavior, and Shopify admin tooling now scopes overview/sync/product/inventory reads/actions to the validated admin store context. Public health, storefront/customer-entry, analytics event, OAuth callback, and webhook surfaces remain intentionally separate from dashboard auth. Issue #153 documents the dashboard-facing Shopify connect contract so new connects do not require the dashboard to store `shopify.accessToken`. |
| Webhooks/sync | Partial | Shopify webhook HMAC verification (raw-body, timing-safe) and shop-domain-to-Store tenant mapping are enforced before webhook handlers run (issue #63); handlers fail closed without a trusted `storeId`. Product and inventory webhook writes and product sync are store-scoped (issue #65). Order webhook writes are store-scoped and reconcile checkout handoffs idempotently (issue #76); Shopify order IDs and order numbers are unique per store, not globally. Webhook-sourced order address validation is relaxed so any address Shopify accepted is storable: `province`, `zip`, and the strict phone format are optional for reconciliation-built orders (empty/missing values persist as absent, logged as a warning), while locally-created orders keep the strict rules (issue #126). Customer webhook matching and the `syncCustomers`/`syncOrders` jobs are store-scoped, and sync-created users/orders carry `storeId` (issue #77; legacy-data backfill documented in `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md`, with release gates in `docs/RELEASE_CHECKLIST.md`). Issue #163 registers `products/create|update|delete`, `orders/create|updated|paid`, `inventory_levels/update`, and `customers/create` with the store Admin token after OAuth. Registration lists existing subscriptions before creating, does not block or fail the callback, and stores `shopify.webhooksRegisteredAt` or `shopify.webhookRegistrationError`. Compliance topics stay app-level (issue #162). Live HMAC delivery against staging remains unverified. Webhook retry behavior remains follow-up work. |
| Testing/CI | Partial | Jest tests, tenant-scoped Storefront tests, type-check script, build script, and CI workflow exist. Issue #85 makes generated TSOA route registration fail fast at app startup and adds focused coverage proving representative search, product detail, cart, checkout, and favorites spec routes mount. Issue #86 updates CI startup reliability by replacing retired and obsolete action majors, removing unsupported `env` context usage from service image fields, hardening the MongoDB service health check, loading the Docker build before its smoke test, and documenting the required type-check/test/build path. The latest observed main CI run before this fix failed at workflow startup before jobs were scheduled; the next PR/main run must verify the updated workflow in GitHub. CI verification run 2026-07-17 (issue #117, PR #118): green — all jobs scheduled and passed (type-check, tests, coverage, build, Docker build, security, API contract, dependency check). Run: https://github.com/daneylpasha/cartaisy-backend/actions/runs/29571792766. Test coverage is not proof that all tenant/security/checkout risks are covered. As of 2026-07-29 the full local suite is green for the first time — 27 suites, 308 tests, 0 failures. Until then `tests/shopify.integration.test.ts` failed on every run (31 failures), which made a real regression indistinguishable from the standing failure; it had gone stale because CI excludes it via `--testPathIgnorePatterns`, so it had not run anywhere in a long time. It is now repaired against the current versioned mounts, store-scoped guards and registration contract (`docs/TESTING.md` records the causes). It is the only test file exercising the real `src/app.ts`, so it is the closest thing to a whole-wiring smoke test the repo has. The CI exclusion was removed the same day (PR #140) and verified on Actions run #645: `Test Suite` green in 6m 20s, 27 suites / 310 tests, so all suites now run in CI. Removing it surfaced two things the exclusion had hidden — a meta-test in `tests/ciWorkflowScripts.test.ts` that asserted the workflow *contained* the exclusion flag (now inverted, so no suite can be dropped again), and three cron schedulers `src/app.ts` started at module import with no way to stop them, which kept Jest alive after every run (now gated on `NODE_ENV !== 'test'`). The `test` job is also capped at `timeout-minutes: 20`, having previously had none. Linting arrived 2026-07-29 as well: `eslint.config.mjs` (ESLint 9 flat config) plus a `npm run lint` script replace a `.eslintrc.js` that was broken in two independent ways and appears never to have run. It is enforced in GitHub Actions as of the same day: the `Type Check & Package Checks` job runs `npm run lint` alongside `type-check`, with no `continue-on-error`, so exceeding the recorded error counts fails the job. The suppression baseline is what makes that safe immediately — the job goes green on the existing debt. Its guarantee is narrower than it first reads: entries record counts per file per rule, not identities, so an unrecorded file fails, a count increase fails, and a cross-file swap fails, but swapping one violation for another of the same rule within one file passes. It stops the debt growing rather than freezing individual violations. `.gitlab-ci.yml`'s `test:lint` job does call `npm run lint`, but it then calls `npm run format:check`, which is not a defined script, so that job remains broken and it is unclear whether the GitLab pipeline is live at all. First run surfaced 255 errors and 1,596 warnings; the errors are baselined per file and per rule in `eslint-suppressions.json` at real severity. The 106 auto-fixable errors were burned down on 2026-07-30 (`eslint --fix` across 37 files, baseline shrunk with `--prune-suppressions`, full suite and type-check green after), leaving **149** — a judgment-required residue dominated by `@typescript-eslint/no-unused-vars` (92). `docs/TESTING.md` carries the full breakdown. |
| Release readiness | Partial | CI/CD workflow files and deployment scripts exist. Railway is now the authoritative staging deployment path (issue #97). Issue #116 recorded and verified a live Railway staging service, API URL, core environment variables, dedicated staging MongoDB connection, a staging `Store` record, and passing `/api/health`/`/api/ready` responses — see the sanitized evidence record in `docs/RELEASE_CHECKLIST.md`. Shopify dev-store credentials were also configured and the OAuth connection verified live in issue #116 (`shopify.isConnected: true` on the staging `Store`); `SHOPIFY_WEBHOOK_SECRET` is present but live webhook delivery was not exercised. Staging tenancy backfill release gates for Product/User/Order remain blocked on operator execution and sanitized evidence (issue #108). AWS/ECS remains an unverified manual workflow path; Docker/manual remains a fallback/reference option. Production path is still undecided. |

First-merchant checkout smoke status (issues #99 and #109): a repeatable
Shopify-hosted checkout/order webhook smoke runbook exists at
`docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md`. Issue #109
attempted to execute the runbook but was blocked before checkout handoff. As of
issue #116, the previously-missing prerequisites are now recorded: a verified
Railway staging URL, `/api/health`/`/api/ready` output, a staging `Store`
record, and a live Shopify OAuth connection (shop domain, scopes,
`shopify.isConnected: true`) — see `docs/RELEASE_CHECKLIST.md`. Still not
exercised: live Shopify webhook HMAC delivery to the staging backend, a test
cart/checkout, and operator approval for live checkout actions. Successful
`checkoutUrl` generation and order webhook reconciliation remain unverified
until an operator runs the smoke test end-to-end and records a real run.

## Phase 4 slice — backend Shopify token ownership

Issue #153 (parent epic #152) moves new merchant Shopify connect onto the backend as the only token owner. The dashboard is expected to call `POST /api/v1/shopify/oauth/connect`, `GET /api/v1/shopify/status`, `POST /api/v1/shopify/disconnect`, and `POST /api/v1/shopify/sync`, then stop writing `shopify.accessToken` for that flow. Disconnect revokes the Shopify token before clearing it; status becomes `disconnected`. One store cannot read another store's token or shop. Partner app env vars are documented in `docs/cartaisy/SHOPIFY_API_POLICY.md`.

This slice does not migrate tokens already stored in the dashboard database. Durable catalog sync status and the build-eligibility gate are issue #154, below. The dashboard UI that stops storing tokens is a separate change in the dashboard repo.

Pull request: https://github.com/daneylpasha/cartaisy-backend/pull/157

## Catalog sync status and build eligibility

Issue #154 (parent epic #152) stores per-store catalog sync status on `Store.catalogSync`: `idle`, `syncing`, `succeeded`, or `failed`, with timestamps and a redacted error summary. The dashboard reads it with `GET /api/v1/shopify/sync` and runs Sync again through the existing `POST /api/v1/shopify/sync` (no second sync entrypoint). Issue #166 starts that same sync automatically after a successful Shopify connect: the callback sets `catalogSync.status` to `syncing` before redirecting and does not wait for the import. A sync error does not fail the connect. A fresh `syncing` run is not started twice; a `syncing` record older than 15 minutes can be claimed again. A failure is retried quietly up to two more times in that sync run before status becomes `failed`. A store may request a build only when Shopify is connected and the latest sync for that shop succeeded. `assertBuildEligible(storeId)` throws `BuildNotEligibleError` with code `BUILD_NOT_ELIGIBLE` for sibling build-request creation (issue #155). The primary dashboard button label is Sync again. `shopify.lastSyncAt` is not the build bar and is not stamped at connect. Contract and UI copy: `docs/cartaisy/SHOPIFY_API_POLICY.md`.

Pull request: https://github.com/daneylpasha/cartaisy-backend/pull/158

## Build request API

Issue #155 (parent epic #152, dashboard `daneylpasha/cartaisy-dashboard#17`) adds a tracked "Build my app" request. v1 does not start an EAS build. Store admins create, list, and read requests for the authenticated store only, and may update the short access-note checklist. Android and iOS statuses are stored separately. Only a platform operator can list every store or change platform status. Store-owner `super_admin` is not enough (issue #170). Grant the flag or `PLATFORM_OPS_EMAILS` by hand, never via signup.

Creation calls `assertBuildEligible(storeId)` from `src/services/catalogSyncService.ts` before insert. Failure is HTTP 409 with `buildEligibilityErrorBody`. This API does not write `Store.catalogSync` and does not use `shopify.lastSyncAt`. Contract: `docs/cartaisy/BUILD_REQUEST_API.md`.

Pull request: https://github.com/daneylpasha/cartaisy-backend/pull/159

## What appears complete

- Backend context entrypoint and shared SaaS context docs now exist.
- Repository workflow rules and PR template exist.
- Package scripts exist for type checking, tests, builds, OpenAPI generation, and coverage.
- CI workflow is intended to include type checking, tests, coverage, build, Docker build, security scanning, API contract testing, and dependency checks. Issue #86 fixes startup-blocking workflow configuration so GitHub can schedule those jobs again.
- Tests exist for several tenant-scoped Storefront paths, CI workflow script references, and generated TSOA route mounting for representative mobile smoke-test routes.
- Railway staging service, environment variables, dedicated staging MongoDB, staging `Store` record, `/api/health`/`/api/ready` responses, and a live Shopify OAuth connection are recorded and verified for issue #116 (see `docs/RELEASE_CHECKLIST.md`).
- New Shopify connects store the Admin token only on the backend (issue #153, PR #157). The dashboard UI that stops writing tokens landed in [cartaisy-dashboard#19](https://github.com/daneylpasha/cartaisy-dashboard/pull/19) (closes #15 and #16).
- Durable catalog sync status and `assertBuildEligible` exist (issue #154, PR #158). Build stays blocked until sync has succeeded for the same connected shop.

## What appears partial

- Tenant isolation and store ownership.
- Shopify Storefront/Admin credential scoping.
- Broader home module payload validation beyond Shopify collection ID ownership.
- Cart, checkout, and order integration assumptions.
- Dashboard/admin store authorization consistency.
- Webhook and sync production readiness.
- Release and rollback operational verification.

## What is not verified or not started

- Full public SaaS readiness.
- End-to-end first merchant onboarding readiness. The target flow is the locked order in `docs/DECISIONS.md` (epic #152): invite-only signup, Connect Shopify, branding, smart-default home preview, tracked "Build my app". The older required home-modules checklist is superseded (2026-09-23).
- Automated mobile app build and app-store submission. **Superseded as a v1 requirement (2026-09-23).** v1 build is a tracked "Build my app" request with independent Android and iOS status. Full self-serve EAS and store-submission automation are outside epic #152. The request API is issue #155. The dashboard UI is [cartaisy-dashboard#17](https://github.com/daneylpasha/cartaisy-dashboard/issues/17).
- Complete checkout strategy documentation and production validation.
- First-merchant Shopify-hosted checkout/order webhook smoke execution against
  an approved development or generated-test-data store. Issue #109 records a
  blocked attempt, not a successful smoke run.
- Complete tenant-safety coverage for every route, job, webhook, and Shopify call.
- A green GitHub CI run on the issue #86 PR or a later main-branch run after the workflow startup fix.
- Live Shopify webhook HMAC delivery against the staging backend, and the full first-merchant Shopify-hosted checkout/order webhook smoke run (see issues #99/#109 status above) — the OAuth connection itself is verified, but webhook delivery and checkout handoff are not.
- Staging tenancy backfill release-gate evidence for Product/User/Order counts,
  Product compound indexes, legacy global unique index absence, backup, and
  rollback notes.

## Current priority areas

1. Tenant isolation and store ownership correctness.
2. Shopify API credential scoping and removal of unsafe global fallbacks from SaaS runtime paths.
3. Checkout/cart/order strategy documentation and tests before behavior changes.
4. Dashboard/mobile API contract validation.
5. Home module validation and Shopify ID ownership checks.
6. Release readiness and rollback verification.
7. Railway staging provisioning and smoke-test evidence.
8. v1 onboarding follows the locked decisions in `docs/DECISIONS.md` (epic #152). Do not reopen token ownership, step order, locked versus editable fields, the sync/build gate, platform rules, the premium bar, invite-only signup, or manual billing.

## Locked v1 onboarding decisions

Recorded 2026-09-23 in `docs/DECISIONS.md` ("Cartaisy v1 merchant onboarding is locked") and `docs/cartaisy/ROADMAP.md` (Phase 4 notes and Phase 6). These are product rules. They are not evidence that the dashboard or mobile UI is finished. Issue #156 is this record. Parent epic: [#152](https://github.com/daneylpasha/cartaisy-backend/issues/152).

Do not reopen:

1. The backend is the sole owner of Shopify OAuth tokens for new connects. The dashboard never stores `shopify.accessToken` for the new flow. Contract: connect, status, disconnect, sync. #153 landed ([PR #157](https://github.com/daneylpasha/cartaisy-backend/pull/157)). Dashboard UI landed in [cartaisy-dashboard#19](https://github.com/daneylpasha/cartaisy-dashboard/pull/19) (closes #15).
2. Order: invite-only signup → Connect Shopify first → branding (most fields editable) → smart-default home preview → tracked "Build my app". Full self-serve EAS is outside the epic. Wizard landed in [cartaisy-dashboard#19](https://github.com/daneylpasha/cartaisy-dashboard/pull/19) (closes #16). Smart default home: [Cartaisy#121](https://github.com/daneylpasha/Cartaisy/issues/121).
3. Locked (Shopify source of truth): shop domain / myshopify URL, Shopify shop id, products, orders, collection contents. Editable: app display name, logo, brand colors, splash and icon, which collections to feature on home, home module layout later. Splash and icon stay build-time.
4. Sync UX: the first catalog sync starts automatically after Shopify connect (issue #166). Primary "Sync again" plus quiet auto-retry remain (`docs/cartaisy/SHOPIFY_API_POLICY.md`). Branding may continue with a warning. Build stays blocked until catalog sync succeeded for the same connected shop (`Store.catalogSync` and `assertBuildEligible`). #154 landed ([PR #158](https://github.com/daneylpasha/cartaisy-backend/pull/158)).
5. Platforms: Android and iOS. Android may ship first. Independent per-platform status. Build request API: #155. Dashboard UI: [cartaisy-dashboard#17](https://github.com/daneylpasha/cartaisy-dashboard/issues/17).
6. Premium white-label bar for the dashboard and the shopper app. Launch waits on both. Shopper pass: [Cartaisy#122](https://github.com/daneylpasha/Cartaisy/issues/122).
7. Invite-only. Manual billing unchanged (decision 2026-07-17, reaffirmed). Google sign-in is an alternative credential for an existing dashboard user, not public signup. See "Merchant dashboard Google sign-in" below.

**Superseded (2026-09-23):** a required home-module builder during onboarding; dashboard storage of `shopify.accessToken` for new connects; public open signup; product billing code; full automated EAS or app-store submission as the v1 build.

On main when this section was written: #153 (PR #157) and #154 (PR #158). Issue #155 remains the build-request API ticket. This section does not claim that API has merged. Dashboard #15 and #16 landed in [cartaisy-dashboard#19](https://github.com/daneylpasha/cartaisy-dashboard/pull/19). Dashboard #17 is still open. Mobile #121 and #122 are outside this repo.

## Request-path Shopify credentials

Issue #165 (parent epic #152). No mobile or dashboard HTTP handler uses `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`, or `SHOPIFY_STORE_URL` as the credential source for tenant traffic.

Favorites detail reads products with `getProductByIdForStore` and the authenticated account's `storeId` (customer principal, or the User record). `request.storeId` is ignored because middleware can copy a caller `x-store-id` onto it. Cart responses still include an empty `metafields` array; they no longer call the process-wide Admin client. Legacy native checkout stays gated off in SaaS/production, and the singleton Storefront/Admin methods fail closed in that mode. Hosted checkout handoff (`POST /api/v1/checkout/handoff`) is unchanged.

Operator scripts under `src/scripts/` and `sync-products-now.js` still read process-wide Shopify env credentials. They are not request handlers. See `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`.

## Operational Shopify webhooks

Issue #163 (parent epic #152). After a successful OAuth connect, Cartaisy registers product, order, inventory, and `customers/create` webhook subscriptions on that shop with `getShopifyClientForStore`. Callbacks are the existing `/api/webhooks/shopify/...` routes. The callback HTTP response does not wait. A failure is logged and stored as `shopify.webhookRegistrationError` on `GET /api/v1/shopify/status`. Reconnect reconciles the list and does not add a duplicate for the same callback. GDPR topics and `app/uninstalled` are unchanged (issue #162). Contract: `docs/cartaisy/SHOPIFY_API_POLICY.md`.

## Merchant dashboard Google sign-in

`POST /api/v1/auth/google` signs in an existing dashboard user (`super_admin`, `admin`, `moderator`) with a Google Identity Services ID token. The account is matched by verified email. Shopper roles (`customer`, `premium_customer`) do not get a dashboard session. Invite-only signup is unchanged: Google does not create users. The success payload matches `POST /api/v1/auth/login`.

Railway production and staging need `GOOGLE_CLIENT_ID` (the dashboard web client ID; comma-separated list allowed). It is not a secret. Unset does not crash boot; the route returns `503` `GOOGLE_NOT_CONFIGURED`. `GOOGLE_CLIENT_SECRET` is not required for this check. Decision: `docs/DECISIONS.md` ("Google sign-in is an alternative merchant credential").

## Related docs/issues

- GitHub issue: #52.
- v1 onboarding epic: #152. Docs record: #156. Children: #153, #154, #155. Dashboard #15–#17. Mobile #121–#122.
- `docs/DECISIONS.md`
- `CARTAISY_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/HOME_MODULE_CONFIG_AUDIT.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
