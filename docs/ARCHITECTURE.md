# Backend Architecture

This file is a backend-specific architecture snapshot for agents and developers. It summarizes the current repo structure and links to deeper audits instead of duplicating them.

Do not assume this exists unless verified in code. Planned architecture, older diagrams, and aspirational infrastructure notes must not be treated as implemented runtime behavior.

## Current state

Current state: the backend is a TypeScript Express and MongoDB/Mongoose application organized as a modular monolith in one deployable Node.js process.

- `src/server.ts` starts a lightweight Express wrapper with `/api/health` and `/api/ready`, mounts the main app, validates configuration, connects to MongoDB, and drops invalid indexes during startup.
- `src/app.ts` configures Express middleware, rate limits, store validation, audit logging, route mounts, generated TSOA routes, Swagger UI, error handling, and 404 handling.
- Main module boundaries are directory-based:
  - `src/routes`: Express route registration by API area.
  - `src/controllers`: request handlers for mobile, dashboard/admin, Shopify, checkout/cart, customer, and analytics flows.
  - `src/services`: Shopify, notifications, background jobs, email, analytics, recommendations, sync, image cleanup, orders, and export services.
  - `src/models`: Mongoose models for stores, users, customers, products, orders, home modules, carts/sessions, analytics, notifications, and related entities.
  - `src/middleware`: authentication, customer auth, store auth, strict store validation, unified cart auth, audit logging, query protection, rate limiting, and error handling helpers.
  - `src/types`, `src/utils`, `src/config`, and `src/scripts` support shared types, helper utilities, configuration, and maintenance scripts.
- In-process schedulers are started from `src/app.ts`, including notification, image cleanup, and abandoned cart schedulers.
- OpenAPI/TSOA generated routes are loaded from `src/generated/routes.ts`, and Swagger reads `public/swagger.json`.

## Target state

Target state: keep the backend understandable as a focused modular monolith unless a human-approved issue explicitly scopes a different deployment or service boundary.

- Keep tenant-owned reads and writes scoped by `storeId` or a verified store context.
- Keep Shopify private/Admin credentials on the backend and resolve store-specific credentials for tenant-specific calls.
- Keep mobile and dashboard API contracts documented when behavior changes.
- Treat checkout, payment, auth, authorization, tenant isolation, Shopify credentials, webhooks, and migrations as high-risk change areas requiring focused review.

## Known gaps

Known gap: older architecture material in this repo described microservices, Redis/Bull queues, PM2 clustering, API gateways, and enterprise infrastructure as if they were current. This file intentionally does not present those as implemented.

- Redis appears in CI service setup and configuration references, but this docs pass did not verify a production Redis-backed cache or Bull queue runtime.
- The backend contains background-job style services and schedulers, but this docs pass did not verify a separate worker deployment.
- CI/CD workflows reference Docker, ECS, Codecov, Snyk, Trivy, staging, production, and rollback flows. Verify deployed infrastructure and secrets before treating those workflows as operationally complete.
- Some source files and docs may still contain historical, placeholder, or future-looking comments. Verify code paths before relying on them.

## Store and tenant model

Current state: store is the tenant boundary. `Store`, `User`, and `Customer` models include store relationships, and many route/controller paths use `storeId`.

- Public storefront routes may accept supplied store context for public data.
- Customer-authenticated flows should derive store context from the authenticated customer record.
- Dashboard/admin flows should bind requested store context to the authenticated admin user's store unless an explicit super-admin path exists.
- See `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` and `docs/cartaisy/TENANCY_MODEL.md` for the detailed current policy and gaps.

Known gap: store scoping in a query is not the same as proving the authenticated user owns that store. Verify middleware and controller behavior before changing tenant-owned routes.

## Shopify integration

Current state: the backend contains Shopify OAuth, Storefront API, Admin API, sync, product/search/recommendation, webhook, order, and checkout-adjacent code.

- Tenant-scoped Storefront helper methods and tests exist for several mobile-facing paths, including search, product detail, homescreen collection display enrichment, collection fetches, and recommendations.
- Store-specific Admin client helper code exists.
- Legacy Admin helpers that call a first-connected or process-wide Shopify client still appear in `src/services/shopifyService.ts` and related route/service call sites.
- Global/process environment Shopify configuration still exists for some compatibility or historical paths.

Known gap: do not assume every Shopify read/write is tenant-safe. Use `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md` and current code inspection before modifying Shopify behavior.

## Cart, checkout, and orders

Current state: the backend has cart, unified cart, checkout-adjacent, order, order management, and Shopify order sync code.

- Unified cart middleware supports guest and customer flows and derives authenticated customer store context from the customer record.
- Checkout and payment error handling receives special treatment in the global error handler.
- Order models, customer order routes, dashboard order management, Shopify order sync, and order analytics code exist.

Known gap: checkout strategy and order source-of-truth assumptions must be explicitly verified before implementation work. Do not change checkout, payment, order completion, or Shopify order sync logic from a docs-only issue.

## Webhooks and sync

Current state: `src/routes/webhookRoutes.ts`, `src/controllers/webhookController.ts`, Shopify sync services, Shopify OAuth routes, and store admin sync/status routes exist.

Known gap: verify webhook signature validation, tenant mapping, retry behavior, and store-scoped sync behavior in code before treating webhooks or sync as production-ready.

## Mobile and dashboard API responsibilities

Current state: this backend serves both mobile-facing and dashboard/admin-facing APIs.

- Mobile-facing areas include product/catalog, search, recommendations, home modules, store config, customer auth/account, addresses, wishlists, reviews, cart, checkout-adjacent flows, notifications, and analytics events.
- Dashboard/admin-facing areas include auth/admin routes, store settings, branding, home module management, customer management, order management, security, email config, abandoned cart, compliance, Shopify OAuth/sync, and push notification management.

Known gap: mobile and dashboard repos must verify their own contracts and behavior. Backend-only docs do not prove cross-repo readiness.

## Related docs/issues

- GitHub issue: #52.
- `CARTAISY_CONTEXT.md`
- `AGENTS.md`
- `.github/pull_request_template.md`
- `docs/cartaisy/README.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/HOME_MODULE_CONFIG_AUDIT.md`
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
