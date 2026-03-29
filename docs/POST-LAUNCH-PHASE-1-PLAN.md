# Post-Launch Phase 1 Plan

## Title

Automation and Daily Briefings

## Summary

This phase adds a small, dependable recurring automation layer on top of the completed `personal-ops` CLI and health surfaces.

Chosen defaults:

- automation-first, not automation-platform-first
- Codex automations as the delivery vehicle
- read-first only
- weekday schedules only
- no new backend, schema, HTTP, or MCP surface

## Key changes

### 1. Create three active Codex automations

- `Morning Brief`
- `Midday Health Guard`
- `End-of-Day Wrap-Up`

Each automation should:

- use `/Users/d/.local/share/personal-ops` as the workspace
- stay read-first
- open exactly one inbox item
- keep output short and operator-oriented

### 2. Reuse current CLI surfaces

Use these commands as the source of truth:

- `personal-ops now --json`
- `personal-ops status --json`
- `personal-ops worklist --json`
- `personal-ops health check`
- `personal-ops health check --deep --json`

### 3. Add durable docs

Add:

- `docs/AUTOMATIONS.md`
- `docs/POST-LAUNCH-PHASE-1-PLAN.md`
- `docs/POST-LAUNCH-PHASE-1-ROLLOUT.md`

Update:

- `docs/POST-LAUNCH-ROADMAP.md`
- `OPERATIONS.md`
- `QUICK-GUIDE.md`
- `START-HERE.md`

### 4. Keep the product surface stable

Do not add:

- new daemon routes
- new MCP tools
- new browser mutations
- a `personal-ops automation` command family
- background send, restore, approval, auth, or task mutation

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

- `personal-ops now --json`
- `personal-ops status --json`
- `personal-ops worklist --json`
- `personal-ops health check`
- `personal-ops health check --deep --json`

Required automation verification:

- create the three TOML definitions
- reconcile them into the Codex automation registry
- confirm they are `ACTIVE`
- confirm each has a future scheduled run
- manually validate the prompt structure against current command output

## Assumptions

- timezone: America/Los_Angeles
- schedules:
  - Morning Brief: weekdays at 8:30 AM
  - Midday Health Guard: weekdays at 1:00 PM
  - End-of-Day Wrap-Up: weekdays at 5:30 PM
- any future product-native automation management belongs in a later phase
