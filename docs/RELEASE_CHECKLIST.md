# Backend Release Checklist

Use this checklist before backend releases or deployment-impacting PRs. It is not a substitute for human release approval.

Do not assume this exists unless verified in code, CI, deployment configuration, and the target environment.

## Current state

Current state: the repo contains CI/CD workflow files, Docker configuration, deployment docs, scripts for backup/restore and final deployment checks, migrations folder, generated API docs, and runtime health endpoints.

Known gap: this docs pass did not verify that deployed infrastructure, required secrets, external services, rollback procedures, or production environments are currently operational.

## Target state

Target state: release readiness should be verified across code, configuration, tenant isolation, Shopify credentials, mobile/dashboard API compatibility, database safety, webhooks, observability, and rollback.

## Pre-release checks

- Confirm the release scope and risk level.
- Confirm the branch and PR only include intended changes.
- Run relevant checks from `docs/TESTING.md`.
- Verify CI status in GitHub, not only local commands.
- Confirm generated artifacts such as `public/swagger.json` are intentionally updated when API contracts change.
- Review `.github/pull_request_template.md` and include changed files, commands, risks, untouched areas, and follow-ups in the PR.

## Environment and secrets checks

- Confirm required environment variables are set in the target environment.
- Confirm no `.env`, credentials, tokens, private keys, API secrets, webhook secrets, or merchant-specific secrets are committed.
- Confirm Shopify Admin/private credentials stay backend-only.
- Confirm mobile/dashboard clients receive only safe public config and API responses.
- Verify production secret-management changes only under explicit approved scope.

## Tenant isolation checks

- Confirm every tenant-owned query includes `storeId` or a verified store context.
- Confirm authenticated customer routes derive store context from the customer record.
- Confirm dashboard/admin routes validate requested store context against the authenticated user's store unless an explicit approved cross-store role exists.
- Confirm background jobs, schedulers, webhooks, analytics, and sync operations use the correct store context.
- Review `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md` for known ownership risks.

## Shopify credentials and config checks

- Confirm tenant-specific Shopify calls use store-scoped Storefront/Admin credentials.
- Confirm no SaaS/prod runtime path falls back to global Shopify credentials or the first connected store for tenant-specific calls.
- Confirm Shopify OAuth, token storage, token decryption, and webhook secrets are verified for the target merchant/store.
- Review `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md` and `docs/cartaisy/SHOPIFY_API_POLICY.md`.

## API compatibility checks for mobile and dashboard

- Confirm changed response shapes are backwards-compatible or coordinated with mobile/dashboard releases.
- Regenerate OpenAPI artifacts when controller/API contracts change.
- Verify mobile-facing routes for home, product, search, recommendations, store config, cart, checkout entry, account, and notifications when relevant.
- Verify dashboard/admin routes for store settings, branding, home modules, customers, orders, security, email, compliance, notifications, and Shopify sync when relevant.

## Database and migration checks

- Confirm whether a migration is required.
- Review `migrations/`, `src/scripts/`, and deployment scripts before running data changes.
- Confirm backup and restore procedures before production data changes.
- Include rollback/migration notes for schema, index, or data changes.
- Do not add or run migrations from docs-only issues.

## Webhook and sync checks

- Confirm webhook signature validation and event-to-store mapping.
- Confirm idempotency, retry behavior, and failure logging where relevant.
- Confirm sync jobs use store-scoped credentials and do not overwrite another merchant's data.
- Verify webhook URLs and secrets in the target environment.

## Rollback notes

- Identify the previous deployable version or Docker image.
- Confirm database changes are backward-compatible or have a documented rollback path.
- Confirm feature flags or config toggles if applicable.
- Confirm smoke checks after rollback, including `/api/health`, `/api/ready`, and critical mobile/dashboard routes.

## Known gaps

Known gap: release workflow files describe staging, production, backups, blue-green deployment, and rollback, but this docs pass did not prove they are wired to live infrastructure.

- Treat release-readiness claims as pending human/operator verification.
- Treat checkout, payment, auth, tenant isolation, Shopify credentials, webhooks, and migrations as high-risk release areas.
- Backend release readiness does not prove mobile, dashboard, app-store, or merchant onboarding readiness.

## Related docs/issues

- GitHub issue: #52.
- `docs/TESTING.md`
- `docs/STATUS.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
- `docs/cartaisy/AGENT_WORKFLOW.md`
- `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- `.github/workflows/ci.yml`
- `.github/workflows/cd.yml`
