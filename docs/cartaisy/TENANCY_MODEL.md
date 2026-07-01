# Tenancy Model

Store is the tenant boundary. Tenant isolation is a high-risk area and must be preserved in every backend, mobile, and dashboard change.

## Current state

- Backend docs identify `storeId` as the central store context for tenant-owned data.
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` documents current store ownership behavior and gaps, including different public, customer-authenticated, and admin-authenticated contexts.
- Existing audits identify routes and Shopify flows that may still need stronger store ownership or store-scoped credential handling.
- Do not assume this exists unless verified in code: every route using authoritative store context, every tenant-owned query including `storeId`, or every authenticated admin route proving store ownership.

## Target state

- Every tenant-owned query includes `storeId` or uses a verified store context set by trusted middleware.
- Public storefront requests may use supplied store context only for public, read-only store data.
- Customer-authenticated requests derive store context from the authenticated customer record, not caller-supplied store IDs.
- Admin/dashboard requests derive or validate store context against the authenticated admin user's allowed store, with explicit super-admin behavior if cross-store access is ever allowed.
- SaaS/prod must not fall back to global Shopify credentials or a first connected store for tenant-specific runtime calls.

## Known gaps

- Some backend route groups and controllers may still need implementation work to enforce the target ownership model. Verify before changing behavior.
- Some docs describe recommended policy rather than current runtime behavior.
- Guest flows, customer flows, admin flows, background jobs, and webhooks may require different validation rules.

## Related repo responsibilities

- Backend: enforce tenant boundaries in middleware, services, database queries, webhooks, jobs, and Shopify client resolution.
- Mobile: send only the documented public store context and never attempt to choose another tenant after authentication.
- Dashboard: operate only within the authenticated merchant store unless an explicit approved admin workflow exists.

## Related docs/issues

- GitHub issue: #50.
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
