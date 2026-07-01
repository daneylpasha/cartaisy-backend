# Issue Priority Rules

Use this order when choosing, scoping, or reviewing Cartaisy issues. Refactors are valuable only when they unblock product progress or reduce high-risk uncertainty.

## Current state

- This repo has docs-only audits that identify tenant isolation and Shopify API risks.
- Issue priority may vary by repo, but shared SaaS launch risk should guide agent decisions.
- Do not assume this exists unless verified in code: any lower-priority polish or refactor being safer than unresolved tenant, Shopify, checkout, or launch blockers.

## Target state

Issue priority order:

1. MVP launch blockers
2. SaaS architecture risks
3. Tenant isolation/security
4. Shopify integration correctness
5. Merchant onboarding
6. Mobile app generation/build readiness
7. UI/UX polish
8. Refactors only when they unblock product progress

Agents should keep one issue per PR unless explicitly approved and should avoid expanding scope beyond the issue.

## Known gaps

- Some blockers may be documented in other repos or external planning docs, not this backend repo.
- Priority depends on current launch phase. Verify current milestone or human instruction when available.
- A task labeled as polish can become high-risk if it touches checkout, Shopify credentials, tenant isolation, auth, or secrets.

## Related repo responsibilities

- Backend: prioritize launch blockers, tenant safety, Shopify correctness, and server-side reliability.
- Mobile: prioritize app generation readiness, stable contracts, customer flows, and launch-critical UX.
- Dashboard: prioritize merchant onboarding, configuration correctness, and build/status flows.

## Related docs/issues

- GitHub issue: #50.
- `docs/cartaisy/MVP_RELEASE_PLAN.md`
- `docs/cartaisy/AGENT_WORKFLOW.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
