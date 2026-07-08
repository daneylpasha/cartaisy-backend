# Backend Testing And Validation

This file summarizes backend validation commands and test expectations. Verify scripts in `package.json` before relying on them.

Do not assume this exists unless verified in code.

## Current state

Current state: `package.json` declares `packageManager: yarn@1.22.19`, but the GitHub Actions CI workflow uses `npm ci` and `npm run ...` commands.

Common scripts currently declared in `package.json`:

- Type check: `npm run type-check` runs `tsc --noEmit`.
- Test: `npm test` runs `jest`.
- Coverage: `npm run test:coverage` runs `jest --coverage`.
- Build: `npm run build` runs OpenAPI generation and TypeScript build.
- Generate OpenAPI/routes: `npm run generate`, `npm run generate:spec`, `npm run generate:routes`.
- Start: `npm start`.
- Dev watch: `npm run dev:watch`.

Lint command: no `lint` script is currently declared in `package.json`, even though ESLint dependencies exist. Do not invent a lint command without adding or verifying one in a scoped issue.

## Target state

Target state: every backend behavior PR should run the smallest relevant command set and add or update tests when backend logic changes.

- Docs-only PRs: inspect markdown, run `git diff --check`, and confirm no runtime files changed.
- Type-only or route/controller/service changes: run `npm run type-check` and targeted Jest tests.
- API contract or generated route changes: run the relevant `npm run generate*` command and verify generated artifacts intentionally.
- Broad backend changes: run `npm test`, `npm run type-check`, and `npm run build` when practical.
- High-risk tenant, auth, Shopify, checkout, webhook, or migration changes: add targeted regression tests and get human review.

## Known gaps

Known gap: tests exist, but they do not prove every tenant, Shopify, checkout, webhook, order, dashboard, or release scenario is covered.

- CI ignores `tests/shopify.integration.test.ts` in the main Jest command.
- Shopify integration tests may require credentials, network access, or explicit local setup. Do not run or rely on them without confirming requirements.
- No package-level lint script is available at the time of this docs update.
- CI/CD workflow files may reference infrastructure, secrets, or test collections that need separate verification.

## CI behavior if known

Current state: `.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` and `develop`, and can also be run manually with `workflow_dispatch`.

The required backend validation path includes:

- `npm ci` before package-script checks.
- `npm run type-check`.
- `npm test -- --runInBand --watchman=false --testPathIgnorePatterns tests/shopify.integration.test.ts`.
- `npm run test:coverage -- --runInBand --watchman=false --testPathIgnorePatterns tests/shopify.integration.test.ts`.
- `npm run build` on Node 18 and Node 20.

The workflow also includes Docker image build verification, Gitleaks/Trivy/Snyk security scanning, best-effort Codecov upload, best-effort Newman API contract testing, and dependency/license reporting. Checks marked `continue-on-error: true` are advisory and should not be treated as proof that the related area is healthy.

Startup reliability expectations:

- Service container images use literal tags such as `mongo:7.0` and `redis:7-alpine`; GitHub Actions does not allow the `env` context in those `image` fields.
- Current maintained action majors are used for checkout, Node setup, artifact upload, CodeQL SARIF upload, Codecov, Docker Buildx/build-push, and Gitleaks. Retired or obsolete action majors such as `actions/upload-artifact@v3`, `actions/upload-artifact@v4`, `github/codeql-action/upload-sarif@v2`, and `github/codeql-action/upload-sarif@v3` must not be used.
- The MongoDB service health check must authenticate with the test credentials and avoid fragile nested shell quoting.
- The Docker build job sets `load: true` so the image tagged `cartaisy/backend:test` is available to the following smoke-test `docker run`.
- Credential-required Shopify live integration tests remain excluded from the default CI Jest command unless they are explicitly configured in a separate opt-in workflow.

Current CI evidence: the issue #86 pull request CI run on 2026-07-08 completed successfully after the workflow startup fixes. The latest observed main-branch CI run before issue #86 still failed at workflow startup before any jobs were scheduled; post-merge main CI should be checked after the PR merges.

## Tenant-safety tests that should exist or be added

- Customer token with mismatched supplied store ID still accesses only the authenticated customer's store.
- Customer token cannot read or write another store's customer-owned data by changing header, query, or body store ID.
- Admin user cannot operate on another store's `:storeId` route without explicit approved super-admin behavior.
- Public storefront routes accept only valid public store context and do not expose private tenant data.
- Shopify Storefront/Admin calls use store-specific credentials for tenant-specific paths.
- Webhook and background job processing maps events to the correct store before mutation.

## Shopify integration test limitations

- Prefer unit tests with mocked Shopify clients for tenant-safety and failure-path behavior.
- Treat live Shopify tests as opt-in integration tests requiring safe credentials and isolated stores.
- Never commit Shopify credentials, access tokens, webhook secrets, or merchant-specific test secrets.

## Required validation before PR

- Confirm changed files are scoped to the issue.
- Run `git diff --check`.
- Run commands appropriate to the change type.
- For docs-only changes, state that no runtime code changed.
- For skipped checks, explain why they were skipped.

## Related docs/issues

- GitHub issue: #52.
- `package.json`
- `.github/workflows/ci.yml`
- `.github/pull_request_template.md`
- `AGENTS.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
