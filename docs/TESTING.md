# Backend Testing And Validation

This file summarizes backend validation commands and test expectations. Verify scripts in `package.json` before relying on them.

Do not assume this exists unless verified in code.

## Current state

Current state: `package.json` declares `packageManager: yarn@1.22.19`, but the GitHub Actions CI workflow uses `npm ci` and `npm run ...` commands.

Common scripts currently declared in `package.json`:

- Type check: `npm run type-check` runs `tsc --noEmit`.
- Test: `npm test` runs `jest`. Local baseline as of 2026-07-29: **27 suites passed, 310 tests passed, 0 failed**, exiting cleanly without `--forceExit`. Treat any deviation as a regression. Until 2026-07-29 the suite had one permanently failing file, which meant a genuine regression and the standing failure were indistinguishable.
- Coverage: `npm run test:coverage` runs `jest --coverage`.
- Build: `npm run build` runs OpenAPI generation and TypeScript build.
- Generate OpenAPI/routes: `npm run generate`, `npm run generate:spec`, `npm run generate:routes`.
- Start: `npm start`.
- Dev watch: `npm run dev:watch`.

Lint command: `npm run lint` runs `eslint .` against ESLint 9 flat config in `eslint.config.mjs`. Added 2026-07-29, replacing a `.eslintrc.js` that could never have worked (see below). It is a local script only — it is deliberately not wired into CI yet.

The old `.eslintrc.js` was broken in two independent ways, which is why linting appears never to have run here. Its `extends` listed `'@typescript-eslint/recommended'` without the required `plugin:` prefix. And `parserOptions.project: './tsconfig.json'` turned on type-aware linting against a tsconfig whose `include` is `src/**/*` and whose `exclude` lists `**/*.test.ts`, so every file under `tests/` sits outside the program and type-aware linting fails on files it cannot resolve. The flat config drops `project` entirely: every type-aware rule in this rule set is off, so it bought nothing, and dropping it makes linting fast and lets it cover `tests/` as well as `src/`.

The migration is a port, not a new rule set. The old config's intent — TypeScript strictness rules off, general hygiene rules on — was deliberate and matches `tsconfig.json`'s own `strict: false`. Raising the strictness level is a separate decision. One deviation was made knowingly: `src/generated/**` is ignored, because tsoa rewrites it on every `npm run generate:routes` and linting it would mean a suppression baseline that churns whenever the spec changes, for output nobody edits by hand.

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

- `tests/shopify.integration.test.ts` is no longer excluded from CI. The two `--testPathIgnorePatterns tests/shopify.integration.test.ts` flags were removed from the "Run tests" and "Generate coverage report" steps in `.github/workflows/ci.yml` on 2026-07-29, so the file now runs in the same Jest invocation as the other 26 suites. That exclusion is why the file was able to drift as far as it did — it had not run anywhere for a long time — and closing it is what makes the repair durable rather than a one-off. Note what this statement does and does not cover: it describes the workflow configuration, which is verifiable from the diff. Whether the file passes *in CI* is a separate claim, and the first CI run that includes it is the only source of truth for that; it was verified green locally (31/31) before the exclusion was removed.
- Removing that exclusion surfaced two things it had been hiding, both fixed alongside it on 2026-07-29. First, `tests/ciWorkflowScripts.test.ts` asserted that the workflow **contained** the exclusion flag — a meta-test pinning the very thing that let the suite rot. That assertion is inverted: CI must now contain no `--testPathIgnorePatterns` at all, so no suite can be quietly dropped again. Second, `src/app.ts` started three cron schedulers (notification, image cleanup, abandoned cart) as a side effect of module import, with no way to stop them; any suite importing `app` therefore kept Jest alive after the run and would have held the CI step open until the job timeout. Those starts are now gated on `NODE_ENV !== 'test'`. The full suite exits cleanly without `--forceExit` as a result — if that warning ever returns, something has started an unstoppable timer at import time again.
- `.github/workflows/ci.yml`'s `test` job now sets `timeout-minutes: 20`. It previously had no timeout, so GitHub's six-hour default applied and a hung run would have burned it. The full suite takes roughly 70 seconds locally, so 20 minutes is generous while still killing a hang quickly. `tests/ciWorkflowScripts.test.ts` asserts the cap exists.
- `tests/shopify.integration.test.ts` does **not** need Shopify credentials or network access, despite what this file previously claimed. It runs entirely against `mongodb-memory-server` via `tests/setup.ts`, and the handful of cases that would touch a real Shopify API assert `[200, 500]` precisely so they pass without one. The credentials caveat below still applies to any genuinely live Shopify test, but not to this file.
- Linting exists as of 2026-07-29 but is not enforced anywhere. `npm run lint` is a local script; no CI job runs it, so nothing stops a violation reaching `main`. Wiring it into the existing `Type Check & Package Checks` job is a deliberate follow-up decision, not an oversight — turning on a new gate is a bigger call than adding the script.
- The lint baseline is not clean. Turning linting on for the first time surfaced **255 errors and 1,596 warnings**. The errors are recorded per file and per rule in `eslint-suppressions.json` (generated once with `eslint --suppress-all`), and the rules keep their real severity, so new violations still fail while the existing debt does not. Error breakdown: `@typescript-eslint/no-unused-vars` 92, `object-shorthand` 70, `prefer-template` 24, `@typescript-eslint/no-require-imports` 20, `prefer-const` 19, `no-useless-escape` 18, `no-duplicate-imports` 7, `no-empty` 2, `prefer-arrow-callback` 1, `@typescript-eslint/no-empty-object-type` 1, `@typescript-eslint/no-unsafe-function-type` 1. **106 of the 255 are auto-fixable with `eslint --fix`** — worth its own burn-down ticket, since roughly 40 per cent of the debt clears with one command. As on the dashboard, the suppressions file records counts per file per rule, not identities: it stops debt growing, it does not freeze individual violations, and it must never be regenerated with `--suppress-all` to turn a red run green.
- Lint output is dominated by warnings, 1,479 of the 1,596 being `no-console`. That severity is inherited from the old config, where it was a deliberate choice, so it was preserved rather than changed during the migration. The practical effect is that `npm run lint` prints far too much to read casually; use `npm run lint -- --quiet` to see only errors. Whether `no-console` should stay a warning at this volume is a rule-intent question for the project owner, not something the migration decided.
- The API contract job in `.github/workflows/ci.yml` is best-effort: it runs Newman only when `tests/postman/cartaisy-api.postman_collection.json` and `tests/postman/ci-environment.postman_environment.json` exist. Those files are not currently present, so the job writes a skipped result instead of implying Postman coverage exists.
- The staging E2E job in `.github/workflows/cd.yml` is also best-effort: it runs only when a `tests/e2e/package.json` suite exists. That suite is not currently present, so the job records a skipped result rather than implying E2E coverage exists.
- CI/CD workflow files reference infrastructure, secrets, or external services that need separate operator verification before release decisions.

## CI behavior if known

Current state: `.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` and `develop`, and can also be run manually with `workflow_dispatch`.

The required backend validation path includes:

- `npm ci` before package-script checks.
- `npm run type-check`.
- `npm test -- --runInBand --watchman=false` — no path exclusions, so all 27 suites run.
- `npm run test:coverage -- --runInBand --watchman=false`.
- `npm run build` on Node 18 and Node 20.

The workflow also includes Docker image build verification, Gitleaks/Trivy/Snyk security scanning, best-effort Codecov upload, optional Newman API contract testing when local Postman files exist, and dependency/license reporting. Checks marked `continue-on-error: true` are advisory and should not be treated as proof that the related area is healthy.

Startup reliability expectations:

- Service container images use literal tags such as `mongo:7.0` and `redis:7-alpine`; GitHub Actions does not allow the `env` context in those `image` fields.
- Current maintained action majors are used for checkout, Node setup, artifact upload, CodeQL SARIF upload, Codecov, Docker Buildx/build-push, and Gitleaks. Retired or obsolete action majors such as `actions/upload-artifact@v3`, `actions/upload-artifact@v4`, `github/codeql-action/upload-sarif@v2`, and `github/codeql-action/upload-sarif@v3` must not be used.
- The MongoDB service health check must authenticate with the test credentials and avoid fragile nested shell quoting.
- The Docker build job sets `load: true` so the image tagged `cartaisy/backend:test` is available to the following smoke-test `docker run`.
- Genuinely credential-requiring Shopify live tests should stay out of the default CI Jest command unless configured in a separate opt-in workflow. This no longer applies to `tests/shopify.integration.test.ts`, which needs no credentials and now runs in the default command; the `services:` block's `mongo:7.0` and `redis:7-alpine` containers are irrelevant to it, because `tests/setup.ts` starts its own `MongoMemoryReplSet` just as it does for every other suite.
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
