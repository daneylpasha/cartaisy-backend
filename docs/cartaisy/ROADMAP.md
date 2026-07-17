# Cartaisy Roadmap

Last updated: 2026-07-17. Owner: Daniyal Pasha. Maintained by the orchestrator (planning agent) and updated in place as phases complete.

This is the shared cross-repo roadmap from current state to first-merchant readiness. It is a plan, not proof of implementation. Do not assume any phase is complete unless its gate evidence is recorded here or in the linked docs. Decisions backing this roadmap are recorded in `docs/DECISIONS.md` (entries dated 2026-07-17).

## Current state

- Backend, mobile, and dashboard repos exist with substantial implementation and a strong docs/audit discipline (see each repo's `docs/STATUS.md`).
- No reachable deployed backend exists; the Railway production URL returns platform 404. Nearly every open verification chain is blocked on this.
- No merchant-branded build artifact has ever been produced (Android EAS blocked at non-interactive keystore init).
- Runtime branding is documented as a contract but not implemented; branding is bundled Cartaisy assets.
- The dashboard duplicates backend schemas and performs Shopify OAuth/token storage locally (to be consolidated).
- No merchant billing code exists (intentional; billing is manual for early merchants).
- No real merchant exists; a Shopify Partners development store will serve as test and demo tenant.

## Target state

The phases below, in order, each ending with a verifiable gate. Work items are ticketed as GitHub Issues in the owning repo; operator (human) steps are marked.

### Phase 0 — Stand up a real environment

1. Create Shopify Partners development store; seed realistic catalog, collections, customers, test orders (operator, with agent-prepared seed plan). This store is also the standing sales demo.
2. Provision Railway staging per `docs/RELEASE_CHECKLIST.md` and issues #97/#107: staging MongoDB, env vars, webhook secret, dev-store credentials, seeded `Store` record; record `/api/health` and `/api/ready` evidence (operator executes, agent prepares exact steps).
3. Verify a green CI run on backend (post-#86 fix) and mobile.
4. Execute staging tenancy backfill release gates for Product/User/Order (issue #108 operator work).

Gate: staging URL responds; dev store connected; webhooks registered; CI green; backfill evidence recorded.

### Phase 1 — Prove the money path end-to-end

1. Execute `docs/FIRST_MERCHANT_SHOPIFY_CHECKOUT_WEBHOOK_SMOKE_RUNBOOK.md` against staging: generated `/cart/*` → `POST /checkout/handoff` → Shopify-hosted checkout → test order → order webhook → store-scoped `Order` + `CheckoutHandoff` reconciliation (issues #99/#109).
2. Seed a second store and run the mobile tenant-mismatch suite (issue #87); fix backend hardening gaps it surfaces (`/customer/auth/profile`, `/customer/orders`, `/unified-cart` were previously flagged).
3. Point mobile at staging and smoke home, catalog, search, product detail, cart, checkout handoff, orders, and auth on device/simulator.

Gate: a recorded, repeatable cart-to-hosted-checkout-to-webhook-to-order run, plus passing cross-store isolation checks.

### Phase 2 — Prove "write once, build for many"

1. Initialize Android remote credentials/keystore for the sample merchant EAS project (operator, interactive); supply Firebase files via EAS file env vars; produce, install, and verify a branded Android artifact with no Cartaisy identity leakage.
2. Rehearse `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md` end-to-end for the sample merchant; log friction; this defines what the setup fee buys.
3. Scope the iOS path (merchant-owned Apple Developer account per `docs/DECISIONS.md`; document enrollment lead time). iOS build proof waits for an available Apple account.

Gate: installable branded Android app on a physical device, produced from env config alone.

### Phase 3 — Runtime branding, the non-laggy way (parallel with Phase 1)

Principle (decision 2026-07-17): build-time defaults are the merchant's brand; runtime is a silent, cached override. No unbranded first paint, no rebuild for color/logo changes.

1. Backend: extend the public `/store/config` contract with validated `primaryColor`, `secondaryColor`, `logoUrl` (branding fields already exist on the backend Store model).
2. Mobile: implement `docs/MOBILE_RUNTIME_BRANDING_CONTRACT.md` — dynamic Tamagui theme from persisted cached config, remote logo with bundled fallback, validation and fallback rules, tests.
3. Dashboard: branding editor (colors + existing logo upload) with homescreen preview, writing through backend APIs only.
4. Author a branding split matrix: for every brandable surface, whether it is dashboard-editable (runtime), onboarding-set (build-time), or both.

Gate: change color/logo in dashboard → app reflects it on next launch without rebuild; fresh install is on-brand from the first frame.

### Phase 4 — Dashboard consolidation (parallel track, small PRs)

1. Move Shopify OAuth/token handling to the backend first (highest risk); retire the dashboard `Store.shopify.accessToken` field.
2. Migrate remaining tenant-data routes to the generated backend API client, route by route: store settings → branding → home modules/app-builder → team → orders/customers/analytics. Delete each dashboard model with its last consumer.
3. Align dashboard auth to backend JWT/roles; remove the hard-coded master-admin email list.
4. Marketing content (blog, newsletter, contact) stays dashboard-local.
5. Add dashboard CI (lint, typecheck, tests) — currently none.

Gate: no dashboard Mongoose model for tenant-owned data; no Shopify token in the dashboard DB; dashboard CI green.

### Phase 5 — Per-merchant push architecture (after Phase 2)

1. Backend: `getFirebaseAdminForStore(storeId)` mirroring the per-store Shopify client pattern; encrypted per-store FCM credential storage; fail closed in SaaS mode.
2. Mobile: verify per-merchant device-token registration lands against the correct store (`X-Store-ID`).
3. Onboarding runbook step: create merchant Firebase project → register apps → install credentials → verify test push. Close out `PUSH_NOTIFICATION_DIAGNOSTIC.md` findings against this target.

Gate: test push delivered to the sample-merchant Android build, scoped to its store only.

### Phase 6 — Sell it: demo and onboarding productization

1. Demo polish: dev store + branded sample app + dashboard walkthrough rehearsed as the sales demo.
2. Dashboard onboarding readiness checklist (account → Shopify connected → branding → modules → preview → build requested) per `docs/DASHBOARD_ONBOARDING_FLOW.md` target state.
3. Billing-lite: `Store.plan` set manually by super admin as a record; no payment code (per decision 2026-07-17).
4. Ops basics scoped to a single operator: monitoring/alerting, secrets rotation notes, incident basics from `docs/cartaisy/MVP_RELEASE_PLAN.md`.

Gate: a prospect can be demoed today and onboarded this week without improvising.

## Sequencing

Critical path: Phase 0 → 1 → 2. Phase 3 runs parallel with Phase 1 (different surfaces). Phase 4 is an independent parallel track suited to delegated small PRs. Phase 5 needs Phase 2. Phase 6 needs all prior phases.

## Workflow

- Planning/orchestration: decisions and phase changes are recorded here and in `docs/DECISIONS.md`.
- Tickets: GitHub Issues in the owning repo, self-contained (goal, context files, scope, exclusions, verification commands, definition of done), sized to one small PR.
- Implementation: any coding agent, following the owning repo's `AGENTS.md`; PRs reference "Closes #N"; scope expansion is forbidden — stop and report instead.
- Review: orchestrator reviews PRs against the ticket and `docs/cartaisy/DEFINITION_OF_DONE.md`; a human merges.
- High-risk areas (checkout, payments, tenancy, auth, Shopify credentials, webhooks, migrations, production config) always require human approval per `docs/cartaisy/SAAS_SCOPE.md`.
- Root-level `issue-*.md` files are legacy: completed ones are removed, open ones migrate to GitHub Issues (housekeeping ticket).

## Known gaps

- This roadmap is not evidence. Each gate requires recorded verification (URLs, artifacts, test output, or dated evidence notes in the linked docs).
- Operator-only steps (accounts, credentials, deployments, live Shopify actions, keystore init) cannot be performed by agents and are the most common blockers; they are called out per phase.
- iOS readiness depends on merchant Apple Developer enrollment timelines outside Cartaisy's control.

## Related docs/issues

- `docs/DECISIONS.md` (2026-07-17 entries)
- `docs/cartaisy/PRODUCT_NORTH_STAR.md`
- `docs/cartaisy/SAAS_SCOPE.md`
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
- `docs/RELEASE_CHECKLIST.md`
- Backend/mobile/dashboard `docs/STATUS.md`
