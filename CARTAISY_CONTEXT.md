# Cartaisy Backend Context

Read this file before backend work in this repo. It is the backend-specific context entrypoint for agents and developers.

Cartaisy is a managed Shopify mobile-app SaaS. The shared product and SaaS source of truth lives in `docs/cartaisy/README.md`.

Do not assume this exists unless verified in code. Planned features, target architecture, and future SaaS scope must not be treated as implemented runtime behavior.

## Current state

Current state: this repo is the Cartaisy backend API. It is a TypeScript Express application backed by MongoDB/Mongoose with route/controller/service/model boundaries.

Backend responsibilities include:

- Mobile-facing APIs for storefront, customer, home module, cart, recommendation, search, notification, and account flows.
- Dashboard/admin APIs for store configuration, branding, home modules, customer management, orders, security, compliance, notifications, and Shopify connection/sync flows.
- Store and tenant context handling for backend data.
- Server-side Shopify integration and secret handling.
- Webhooks, sync, background schedulers, generated API docs, and operational documentation.

## Target state

Target state: agents should use this file as the local backend map, then read the linked shared and backend docs before changing behavior.

- Start with `docs/cartaisy/README.md` for shared product and SaaS context.
- Use `docs/ARCHITECTURE.md` for backend architecture.
- Use `docs/STATUS.md` for backend readiness and risk snapshot.
- Use `docs/DECISIONS.md` for backend product and architecture decisions.
- Use `docs/TESTING.md` for validation commands and known test gaps.
- Use `docs/RELEASE_CHECKLIST.md` before release or deployment-impacting changes.
- Use audits and policy docs for tenant, Shopify, and home module details.

## Known gaps

Known gap: this file is human/agent-maintained and can drift from code.

- Verify implemented behavior in source files before changing runtime code.
- Verify current PR checks and deployment workflows in GitHub before claiming CI/CD readiness.
- Verify mobile and dashboard behavior in their own repos before claiming cross-repo readiness.
- Do not modify checkout, payment, auth, authorization, tenant isolation, Shopify implementation, secrets, migrations, package files, CI, or runtime behavior from a docs-only issue.

## Related docs/issues

- GitHub issue: #52.
- Shared SaaS context: `docs/cartaisy/README.md`
- Repo rules: `AGENTS.md`, `CLAUDE.md`
- PR template: `.github/pull_request_template.md`
- Backend architecture: `docs/ARCHITECTURE.md`
- Backend status: `docs/STATUS.md`
- Backend decisions: `docs/DECISIONS.md`
- Backend testing: `docs/TESTING.md`
- Backend release checklist: `docs/RELEASE_CHECKLIST.md`
- Shopify tenant audit: `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`
- Home module audit: `docs/HOME_MODULE_CONFIG_AUDIT.md`
- Store ownership policy: `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`
- Shared tenancy policy: `docs/cartaisy/TENANCY_MODEL.md`
- Shared Shopify API policy: `docs/cartaisy/SHOPIFY_API_POLICY.md`
- Shared Definition of Done: `docs/cartaisy/DEFINITION_OF_DONE.md`
- Shared agent workflow: `docs/cartaisy/AGENT_WORKFLOW.md`
