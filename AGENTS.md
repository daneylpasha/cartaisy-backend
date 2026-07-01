# AGENTS.md

Repository rules for AI agents and human developers working on Cartaisy Backend.

See also: `CLAUDE.md` for project architecture, coding standards, API patterns, authentication middleware names, and database conventions.
See also: `docs/cartaisy/README.md` for shared Cartaisy product and SaaS architecture context.

## Pull request descriptions

If the task refers to a GitHub issue number, the PR description must include a GitHub closing keyword for that issue. Example:

```text
Closes #12
```

Use the exact issue number from the task. This is required so GitHub automatically closes the issue when the PR is merged.

## Branching and pull requests

- Do not push directly to `main` or `staging`.
- Work from a feature branch and open a pull request against `main` unless the issue says otherwise.
- Keep PRs small, focused, and limited to the GitHub issue being worked on.
- Do not touch unrelated files or make opportunistic refactors.
- Do not commit temporary GitHub issue body files such as `issue-*.md`; they are only for local issue creation and must be removed before opening a PR.

## Secrets and environment files

- Do not modify production secrets, deployed environment variables, or secret-management configuration unless the GitHub issue explicitly asks for it.
- Do not commit `.env` files, credentials, tokens, private keys, API keys, or merchant-specific secrets.
- Do not expose Shopify access tokens, refresh tokens, API secrets, webhook secrets, or app credentials to mobile clients, frontend clients, logs, API responses, or generated docs.
- Treat checkout, payment, authentication, authorization, and tenant-isolation data as sensitive.

## Checkout, payment, auth, and tenant isolation

- Do not change checkout, payment, authentication, authorization, or tenant-isolation logic unless the GitHub issue explicitly asks for that change.
- Every tenant-owned backend query must include `storeId` or otherwise be explicitly scoped to the current store.
- Every Shopify API call must use store-specific credentials; never use global or hard-coded merchant credentials for store-specific operations.
- Do not add merchant-specific code branches, hard-coded merchant IDs, one-off store behavior, or customer-specific exceptions.
- Preserve existing validation and authorization checks when editing request handlers, services, middleware, or models.

## Backend changes

- Add or update tests when changing backend logic.
- Prefer the smallest safe change that satisfies the issue.
- Avoid large refactors, dependency upgrades, formatting-only rewrites, or broad file moves unless the issue explicitly requests them.
- Do not wrap imports in `try`/`catch` blocks.
- Keep generated files out of commits unless the command or project workflow requires them for the specific change.

## PR summary checklist

AI-generated PRs must include:

- Changed files and a short explanation of each change.
- Commands run, including tests, type checks, builds, or lint checks.
- Known risks or areas that need careful review.
- Follow-up TODOs, if any.
