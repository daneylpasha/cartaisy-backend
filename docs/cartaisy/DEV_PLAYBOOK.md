# Cartaisy Dev Playbook

Last updated: 2026-07-17. For the human developer working the Cartaisy ticket queue. Read once; then the loop below is your entire job description. The orchestrator (planning agent, "Fable") writes tickets and reviews PRs; Daniyal handles operator/approval gates; you run the loop.

## The loop

1. **Pick the next ticket.** Open `[agent]` issues are the queue:
   ```bash
   gh issue list --repo daneylpasha/cartaisy-backend --state open
   gh issue list --repo daneylpasha/Cartaisy --state open
   gh issue list --repo daneylpasha/cartaisy-dashboard --state open
   ```
   Rules: take `[agent]` tickets only (never `[operator]` — those are Daniyal's). If several are open, priority is the ticket that says it blocks others, otherwise oldest first. If a ticket depends on an unfinished `[operator]` ticket, skip it. If the queue is empty, ping Daniyal/Fable — do not invent work.

2. **Hand it to a coding agent.** Open Claude Code or Codex *inside the repo the issue belongs to* and give it exactly this:
   ```
   Run `gh issue view <N>`. Read the context files it lists, in order.
   Then implement the ticket exactly as written — nothing more.
   One small PR referencing "Closes #<N>", following the repo's PR template.
   If anything unexpected happens or the ticket seems wrong/ambiguous,
   comment your findings on issue #<N> and STOP. Do not fix unrelated things.
   ```

3. **Sanity-check before pushing.** You are the human firewall, not a reviewer. Check only:
   - The diff touches ONLY what the ticket scopes (a docs ticket touching `src/` = reject, back to the agent).
   - Nothing in the diff contains a secret, token, or connection string.
   - The repo's own validation passes (each repo's `docs/TESTING.md` lists the commands — typically `npm run typecheck && npm run lint && npm test`).
   - **Never** merge changes to checkout, payments, auth, tenancy, Shopify credentials, webhooks, or migrations without Daniyal's explicit approval — even if a ticket seems to allow it (see `docs/cartaisy/SAAS_SCOPE.md`).

4. **Push the branch, open the PR** (the agent usually does this; verify it references "Closes #N"), and wait for CI.

5. **Request orchestrator review.** In the team's Cowork/Claude session, say: "Review the PR for issue #N against the ticket and Definition of Done." Paste the review outcome as a PR comment if it isn't posted automatically.

6. **Merge** after the review passes and CI is green. Docs-only and low-risk PRs: you may merge. Anything touching the high-risk list in step 3: Daniyal merges.

7. **Confirm the issue auto-closed**, then go to step 1.

## Model routing

Every repo has two GitHub Actions workers, dispatched by mention:

- `@claude` — the default (Sonnet). All tickets go here unless a rule below says otherwise.
- `@claude-opus` — the escalation tier (Opus). Use it only for: root-cause debugging, multi-file architectural work, or tickets the orchestrator has flagged high-complexity.

Mandatory escalation rule: a ticket whose Sonnet PR needs rework twice is re-dispatched to `@claude-opus` — do not send it to `@claude` a third time. Note the escalation as a comment on the issue so the history shows why.

Mentions are exclusive: a comment containing `@claude-opus` triggers only the Opus worker, never the default one. Both workers run with the same turn cap.

## Automated review comments (Greptile etc.)

Every PR gets automated review. Those comments are **input, not orders** — triage each one (or have the coding agent do it with the prompt below):

- Valid AND within the ticket's scope → fix on the same branch.
- Valid but OUT of scope → do not fix. Reply "valid, out of scope for #<ticket>", and bring it to the orchestrator, who decides if it becomes a follow-up ticket.
- Incorrect/noise → reply briefly why, and resolve the thread.

Never silently ignore a comment. Merge requires: CI green + orchestrator review + every automated-review thread fixed or answered.

Automatic triage: `.github/workflows/claude-greptile-triage.yml` runs Claude Code itself on every Greptile review submission or review comment, performing the exact triage above (fix in-scope, flag out-of-scope, resolve noise), capped at 15 turns and guarded against ping-ponging with Greptile.
The orchestrator/human only gets pulled in for what that workflow reports as "valid, out of scope" — a follow-up-ticket call — or when its loop guard trips after 2 runs on the same PR.
This workflow is CI/workflow config, so it's on the high-risk list: Daniyal reviews and merges any change to it, same as the model-routing workflows.

Agent prompt template:
```
Read the automated review comments on PR #<N> (gh pr view <N> --comments).
Triage each: valid + in scope of issue #<M> → fix on this branch; valid but
out of scope → reply "valid, out of scope for #<M>" and list it for the
orchestrator; incorrect → reply why and resolve. Do not expand scope.
Report the triage summary.
```

## Decision authority

Business-strategy decisions — pricing, product scope, target market, merchant-facing behavior/features, partnerships, positioning — are made only in conversation with Daniyal and recorded in `docs/DECISIONS.md` (backend repo) before any ticket exists. The orchestrator may propose options with trade-offs, but never decides or tickets strategy unilaterally.

Operational decisions — sequencing, ticket slicing, model routing, review verdicts — are delegated to the orchestrator within the approved roadmap.

Strategy/architecture conversations happen in the dedicated Fable-model session when available and always conclude with a DECISIONS.md entry. Operational orchestration (status, reviews, dispatch, evidence checks) may run on any model — all sessions are bound by the same repo rules.

## When to interrupt Daniyal (only these)

- An `[operator]` ticket is blocking the whole queue.
- A PR touches the high-risk list and needs his approval/merge.
- An agent found something that changes the plan (posted on the issue) and Fable's re-plan needs a human decision.
- Credentials/accounts/payments of any kind are needed.

Everything else: work the queue.

## When a ticket goes sideways

The agent commented on the issue and stopped (as instructed). Do not patch around it. Bring the issue number to the orchestrator session: "Issue #N is blocked, see the agent's comment — re-plan." Fable rewrites the ticket or cuts a follow-up. That's the system working, not failing.

## House rules recap (from the repos' AGENTS.md — these win over this playbook if they conflict)

- npm is the package manager everywhere; never commit lockfile churn from other tools.
- Small PRs. One ticket = one PR.
- Docs describe target state vs current state carefully — never mark something done that wasn't verified.
- Status snapshots (`docs/STATUS.md`) get updated when behavior changes, in the same PR.
- No secrets in git, issues, PR descriptions, or logs. Presence statements only ("token configured in Railway").

## Current phase

Phase 2 of `docs/cartaisy/ROADMAP.md` — the first branded Android app build (Phase 0 gate met 2026-07-22; Phase 1 gate met 2026-07-22, evidence linked in the roadmap). Phase 2 needs Daniyal's operator step first (interactive Android keystore/signing setup) before agent tickets can build on it. Phases 3 (runtime branding) and 4 (dashboard consolidation) are open as parallel tracks per the roadmap's sequencing and are cut by the orchestrator as capacity allows.
