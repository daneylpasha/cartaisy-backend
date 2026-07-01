# Agent Workflow

Use the GitHub issue to AI branch to PR to checks to Greptile review to human merge workflow. Never merge automatically.

## Current state

- `AGENTS.md` requires feature branches, small PRs, closing keywords for issue-linked PRs, and PR summaries with files, commands, risks, and follow-ups.
- The expected workflow includes GitHub issue URLs, AI-created branches, PR checks, Greptile review, and human merge.
- Do not assume this exists unless verified in code or GitHub: checks passing, Greptile review completing, or a PR being ready to merge.

## Target state

- Ask Codex or other agents to work from full GitHub issue URLs.
- Use one issue per branch and one issue per PR unless human approval explicitly expands scope.
- Create a branch for the issue and keep changes focused.
- Open a PR with `Closes #issue-number` in the body.
- Run relevant checks and report any skipped checks with the reason.
- Wait for automated checks, Greptile review, and human review.
- Human merges after review. Agents must not merge automatically.
- Update docs when architecture or product assumptions change.

## Known gaps

- CI availability, required checks, and Greptile behavior must be verified per repo.
- Some docs-only changes may not need runtime tests, but the PR must still say which checks were run or why not.
- If an issue touches multiple repos, coordinate separate focused PRs unless a human approves another approach.

## Related repo responsibilities

- Backend: follow backend AGENTS rules, protect secrets, and avoid runtime changes in docs-only issues.
- Mobile: follow mobile repo workflow and verify app contracts visually or with available tests when behavior changes.
- Dashboard: follow dashboard repo workflow and verify admin/onboarding UX when behavior changes.

## Related docs/issues

- GitHub issue: #50.
- `AGENTS.md`
- `docs/cartaisy/DEFINITION_OF_DONE.md`
- `docs/cartaisy/ISSUE_PRIORITY_RULES.md`
