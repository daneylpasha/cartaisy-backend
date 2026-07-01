# Shared Cartaisy Context

This folder is the shared Cartaisy product and architecture context pack for AI agents and human developers working across backend, mobile, and dashboard repos.

Read these docs before modifying major backend, mobile, dashboard, onboarding, Shopify, checkout, tenant-isolation, or build-flow behavior. Repo-specific implementation docs still live in each repo; this folder explains the shared product direction and cross-repo rules.

Planned features must not be treated as implemented unless verified in code. Do not assume this exists unless verified in code.

## Current state

- Cartaisy has backend-specific docs in this repo, including architecture, Shopify tenant-client audit, store ownership validation policy, and home module configuration audit.
- Shared SaaS product context has been added here as portable markdown so it can later move to a dedicated Cartaisy control-center or docs repo.
- The backend repo contains Node.js, Express, TypeScript, MongoDB/Mongoose, Shopify-related services, mobile-facing APIs, and admin/dashboard-facing routes. Verify exact behavior in code before changing implementation.

## Target state

- Agents use this folder as the first stop for Cartaisy product scope, SaaS guardrails, tenant rules, Shopify API policy, cross-repo responsibilities, release priorities, issue priority rules, workflow, and Definition of Done.
- Repo-specific docs remain authoritative for local file layout, commands, middleware names, and implemented behavior.
- Any product or architecture assumption that changes must be reflected in this context pack or in the relevant repo-specific docs.

## Known gaps

- These docs do not prove that any planned feature exists in backend, mobile, dashboard, CI, or deployment.
- Some existing backend docs may describe target or enterprise patterns. Verify implementation in code before relying on those statements.
- Cross-repo behavior must be confirmed in the relevant repo before implementation work begins.

## Related repo responsibilities

- Backend: APIs, store-scoped data access, Shopify server-side calls, customer/admin auth boundaries, webhooks, jobs, and docs for backend behavior.
- Mobile: merchant-branded iOS/Android app engine, mobile UX, app configuration consumption, storefront flows, customer auth, and client-safe token handling.
- Dashboard: merchant onboarding, store configuration, branding, home modules, build requests, and admin workflows.

## Related docs/issues

- GitHub issue: #50.
- Backend docs: `AGENTS.md`, `CLAUDE.md`, `docs/STORE_OWNERSHIP_VALIDATION_POLICY.md`, `docs/SHOPIFY_TENANT_CLIENT_AUDIT.md`, `docs/HOME_MODULE_CONFIG_AUDIT.md`.
- Context files in this folder:
  - `PRODUCT_NORTH_STAR.md`
  - `SAAS_SCOPE.md`
  - `TENANCY_MODEL.md`
  - `SHOPIFY_API_POLICY.md`
  - `CROSS_REPO_MAP.md`
  - `MVP_RELEASE_PLAN.md`
  - `ISSUE_PRIORITY_RULES.md`
  - `AGENT_WORKFLOW.md`
  - `DEFINITION_OF_DONE.md`
