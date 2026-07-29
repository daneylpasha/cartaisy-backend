# Backend Testing And Validation

This file summarizes backend validation commands and test expectations. Verify scripts in `package.json` before relying on them.

Do not assume this exists unless verified in code.

## Current state

Current state: `package.json` declares `packageManager: yarn@1.22.19`, but the GitHub Actions CI workflow uses `npm ci` and `npm run ...` commands.

Common scripts currently declared in `package.json`:

- Type check: `npm run type-check` runs `tsc --noEmit`.
- Test: `npm test` runs `jest`. Local baseline as of 2026-07-29: **27 suites passed, 308 tests passed, 0 failed.** Treat any deviation as a regression. Until 2026-07-29 the suite had one permanently failing file, which meant a genuine regression and the standing failure were indistinguishable.
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
- TSOA route registration changes: run `npm test -- --runInBand --watchman=false tests/tsoaRouteRegistration.test.ts` to prove representative generated search, product detail, cart, checkout, and favorites routes mount.
- Broad backend changes: run `npm test`, `npm run type-check`, and `npm run build` when practical.
- High-risk tenant, auth, Shopify, checkout, webhook, or migration changes: add targeted regression tests and get human review.

## Known gaps

Known gap: tests exist, but they do not prove every tenant, Shopify, checkout, webhook, order, dashboard, or release scenario is covered.

- CI still ignores `tests/shopify.integration.test.ts` in the main Jest command (`--testPathIgnorePatterns`). That exclusion is why the file was able to drift as far as it did: it had not run anywhere for a long time. As of 2026-07-29 the file passes 31/31 locally, so removing the exclusion is now a live option and a deliberate follow-up decision, not a blocked one.
- `tests/shopify.integration.test.ts` does **not** need Shopify credentials or network access, despite what this file previously claimed. It runs entirely against `mongodb-memory-server` via `tests/setup.ts`, and the handful of cases that would touch a real Shopify API assert `[200, 500]` precisely so they pass without one. The credentials caveat below still applies to any genuinely live Shopify test, but not to this file.
- No package-level lint script is available at the time of this docs update.
- The API contract job in `.github/workflows/ci.yml` is best-effort: it runs Newman only when `tests/postman/cartaisy-api.postman_collection.json` and `tests/postman/ci-environment.postman_environment.json` exist. Those files are not currently present, so the job writes a skipped result instead of implying Postman coverage exists.
- The staging E2E job in `.github/workflows/cd.yml` is also best-effort: it runs only when a `tests/e2e/package.json` suite exists. That suite is not currently present, so the job records a skipped result rather than implying E2E coverage exists.
- CI/CD workflow files reference infrastructure, secrets, or external services that need separate operator verification before release decisions.

## CI behavior if known

Current state: `.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` and `develop`, and can also be run manually with `workflow_dispatch`.

The required backend validation path includes:

- `npm ci` before package-script checks.
- `npm run type-check`.
- `npm test -- --runInBand --watchman=false --testPathIgnorePatterns tests/shopify.integration.test.ts`.
- `npm run test:coverage -- --runInBand --watchman=false --testPathIgnorePatterns tests/shopify.integration.test.ts`.
- `npm run build` on Node 18 and Node 20.

The workflow also includes Docker image build verification, Gitleaks/Trivy/Snyk security scanning, best-effort Codecov upload, optional Newman API contract testing when local Postman files exist, and dependency/license reporting. Checks marked `continue-on-error: true` are advisory and should not be treated as proof that the related area is healthy.

Startup reliability expectations:

- Service container images use literal tags such as `mongo:7.0` and `redis:7-alpine`; GitHub Actions does not allow the `env` context in those `image` fields.
- Current maintained action majors are used for checkout, Node setup, artifact upload, CodeQL SARIF upload, Codecov, Docker Buildx/build-push, and Gitleaks. Retired or obsolete action majors such as `actions/upload-artifact@v3`, `actions/upload-artifact@v4`, `github/codeql-action/upload-sarif@v2`, and `github/codeql-action/upload-sarif@v3` must not be used.
- The MongoDB service health check must authenticate with the test credentials and avoid fragile nested shell quoting.
- The Docker build job sets `load: true` so the image tagged `cartaisy/backend:test` is available to the following smoke-test `docker run`.
- Credential-required Shopify live integration tests remain excluded from the default CI Jest command unless they are explicitly configured in a separate opt-in workflow.
- Missing Postman and E2E suites are explicit skips, not successful release validation.

Known gap: the latest observed main-branch CI run before issue #86 failed at workflow startup before any jobs were scheduled. The issue #86 fix updates the startup-blocking workflow configuration; the next pull request or main CI run is the source of truth for whether GitHub now schedules and completes the checks.

## Tenant-safety tests that should exist or be added

- Legacy local product catalog list/search/featured/category/related/recommendation reads must prove Store A cannot receive Store B products (`tests/productCatalogStoreScoping.test.ts`).
- Customer token with mismatched supplied store ID still accesses only the authenticated customer's store.
- Customer token cannot read or write another store's customer-owned data by changing header, query, or body store ID.
- Admin user cannot operate on another store's `:storeId` route without explicit approved super-admin behavior.
- Public storefront routes accept only valid public store context and do not expose private tenant data.
- Shopify Storefront/Admin calls use store-specific credentials for tenant-specific paths.
- Webhook and background job processing maps events to the correct store before mutation.

## Shopify integration test limitations

Repaired 2026-07-29. `tests/shopify.integration.test.ts` had been failing every run, and it is the only test file that imports the **real** app (`src/app.ts`) rather than building a minimal local Express app around one router — so every request in it must match the app's real mounts. Five things had gone stale, and only the first was visible before the fix, because `beforeAll` threw and no test body ever ran:

- Every non-webhook path was missing the `/v1` segment. Paths are now derived from `apiConfig.version` rather than hardcoded. The three `/api/webhooks/...` paths are deliberately unversioned — `webhookRoutes` is mounted without a version because Shopify calls those URLs directly — and must stay that way.
- `POST /auth/register` now either creates a store (needs `storeName`) or accepts an invite (needs `inviteToken`). The fixture sent neither and got a 400 even at the correct path.
- `requireOwnedStoreContext()` will not infer a super admin's store from their own record, so every authenticated request needs an explicit `X-Store-ID`.
- Fixtures lived in `beforeAll`, but `tests/setup.ts` clears all collections in an `afterEach`; they had to move to `beforeEach` or every test after the first would 401 on a dangling token.
- `afterAll` called `mongoose.connection.close()`, which killed the shared connection for the rest of the file and for `setup.ts`'s own teardown. Connection lifecycle belongs to `tests/setup.ts` alone; no test file should close it.

Two assertions and one missing call were also stale: `enhance-seo` returns `data.productId`, not `data.seo`; product analytics returns the model's `viewCount`/`conversionRate`, not `views`/`conversions`; and `initializeBackgroundJobs()` was imported but never called, so `/admin/jobs/:name/run` looked up an empty job registry and always threw.

- Prefer unit tests with mocked Shopify clients for tenant-safety and failure-path behavior.
- Treat live Shopify tests as opt-in integration tests requiring safe credentials and isolated stores.
- Never commit Shopify credentials, access tokens, webhook secrets, or merchant-specific test secrets.

## Required validation before PR

- Confirm changed files are scoped to the issue.
- Run `git diff --check`.
- Run commands appropriate to the change type.
- For TSOA registration changes, include the focused generated-route mount test and note any required local npm cache override if the user-level npm cache is not writable.
- For docs-only changes, state that no runtime code changed.
- For skipped checks, explain why they were skipped.

## Related docs/issues

- GitHub issue: #52.
- `package.json`
- `.github/workflows/ci.yml`
- `.github/pull_request_template.md`
- `AGENTS.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
