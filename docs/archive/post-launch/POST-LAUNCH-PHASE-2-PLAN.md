# Post-Launch Phase 2 Plan

## Title

Interactive Console, Narrowly Scoped

## Summary

This phase turns the local operator console from read-first into lightly interactive, while keeping the trust model conservative.

Chosen defaults:

- keep the current seven console sections
- allow only a narrow browser mutation allowlist
- keep approvals, tasks, restore, auth, send, and other high-trust actions in the CLI
- reuse existing CLI and HTTP surfaces where possible
- add richer drill-down detail inside the current console structure instead of redesigning navigation

## Key changes

### 1. Add narrow browser-safe mutations

Allow console browser sessions to perform only:

- snapshot creation
- planning recommendation apply
- planning recommendation snooze
- planning recommendation reject
- planning recommendation group snooze
- planning recommendation group reject

Keep browser sessions blocked from:

- approvals
- task mutation
- restore
- auth flows
- send and send-window control
- sync and other broader admin actions

### 2. Add richer detail views inside the existing sections

Keep:

- Overview
- Worklist
- Approvals
- Drafts
- Planning
- Audit
- Backups

Add richer detail handling for:

- worklist-linked tasks, inbox threads, recommendations, approvals, and snapshots
- planning recommendation and group detail
- approvals detail with exact CLI commands
- backups detail with provenance and restore guidance
- overview links into planning and backup workflows

### 3. Keep the backend changes narrow

Do not add:

- new CLI command families
- new MCP tools
- new auth models
- broad browser mutation support

Only expand the browser-session allowlist for the approved Phase 2 routes and keep existing bearer-token behavior unchanged.

### 4. Update durable docs

Add:

- `docs/POST-LAUNCH-PHASE-2-PLAN.md`
- `docs/POST-LAUNCH-PHASE-2-ROLLOUT.md`

Update:

- `docs/POST-LAUNCH-ROADMAP.md`
- `OPERATIONS.md`
- `QUICK-GUIDE.md`
- `START-HERE.md`

## Verification

Required repo verification:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:all`

Required live checks:

- `personal-ops console --print-url`
- browser check of all seven sections
- create one snapshot from the console
- apply or snooze one planning recommendation from the console
- confirm approval actions still direct the operator to CLI
- `personal-ops status`
- `personal-ops doctor --deep --json`

Required focused verification:

- browser session auth is accepted only for the new browser-safe routes
- browser session auth remains blocked for approvals, tasks, restore, send, auth, and send-window control
- snapshot creation refreshes the Backups section
- planning actions refresh the affected planning state
- locked-session guidance still points the operator back to `personal-ops console`

## Assumptions

- the current seven-section layout is good enough to preserve
- the first browser-safe mutations should be planning actions plus snapshot creation
- approvals remain CLI-only even though the backend supports them
- tasks remain CLI-only in this phase
- if a detail view needs more data, use the smallest additive read expansion needed rather than redesigning the backend
