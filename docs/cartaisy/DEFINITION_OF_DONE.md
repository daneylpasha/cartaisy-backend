# Definition Of Done

Definition of Done depends on risk. Docs-only work should not change runtime behavior. Runtime work must prove safety at the right layer before PR review.

## Current state

- `AGENTS.md` requires tests for backend logic changes, focused PRs, secrets protection, tenant-safety care, and PR summaries.
- Do not assume this exists unless verified in code: tests covering a changed behavior, generated files being up to date, or tenant isolation being complete.

## Target state

- Code checks:
  - Run the relevant test, type-check, build, lint, or generation command for the touched area.
  - For docs-only PRs, validate markdown by inspection and confirm no runtime files changed.
- Tests:
  - Add or update tests for backend logic changes.
  - Include tenant-safety regression tests when auth, store context, Shopify credentials, or tenant-owned queries change.
- Docs:
  - Update shared context or repo docs when product, architecture, API, Shopify, checkout, or tenant assumptions change.
- Tenant safety:
  - Every tenant-owned query includes `storeId` or verified store context.
  - Authenticated customer/admin routes do not trust caller-supplied store IDs without validation.
- Secrets handling:
  - No `.env`, credentials, tokens, private keys, API secrets, webhook secrets, or merchant-specific secrets in commits, logs, responses, docs, or clients.
- PR description:
  - Summary of changes.
  - Files added/updated.
  - Commands run.
  - Known risks or careful-review areas.
  - Follow-up TODOs, if any.
  - Closing keyword when tied to an issue.
- High-risk PR handling:
  - Checkout, payment, auth, authorization, tenant isolation, Shopify credentials, webhooks, migrations, and production config changes require focused scope and human review.
  - Include rollback and migration notes where relevant.

## Known gaps

- Repo-specific required checks may differ. Verify package scripts, CI, and repo docs before claiming completion.
- Greptile or other review automation may raise follow-up work outside the local checks.
- Rollback plans may need operations input for migrations, secrets, Shopify app config, or deployed infrastructure.

## Related repo responsibilities

- Backend: tests, type checks, generated API artifacts when required, tenant safety, secrets safety, and server-side rollback notes.
- Mobile: app-level tests or manual verification for UI and runtime behavior, client-safe token boundaries, and release notes.
- Dashboard: admin workflow verification, form/config validation, and merchant onboarding checks.

## Related docs/issues

- GitHub issue: #50.
- `AGENTS.md`
- `docs/cartaisy/AGENT_WORKFLOW.md`
- `docs/cartaisy/TENANCY_MODEL.md`
- `docs/cartaisy/SHOPIFY_API_POLICY.md`
