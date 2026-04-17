# Post-Launch Phase 3 Plan

## Title

Reliability and Recovery Automation

## Summary

This phase makes long-running `personal-ops` operation safer by adding:

- explicit snapshot retention through `personal-ops backup prune`
- stronger recovery posture in `personal-ops health check` and `personal-ops doctor`
- a dedicated restore confidence loop through `npm run verify:recovery`
- recurring Codex automations for midday recovery health, end-of-day recovery snapshots, and weekly rehearsal reminders

## Locked decisions

- recurring reliability work lives in Codex automations, not a product-side scheduler
- unattended mutation is limited to local snapshot create and local prune
- restore remains manual and CLI-only
- retention policy is fixed:
  - keep all snapshots for 24 hours
  - keep newest per day through 14 days
  - keep newest per week through 8 weeks
  - prune older than 8 weeks
  - always keep the newest snapshot
- no new HTTP routes
- no new MCP tools
- no schema changes

## Deliverables

- `personal-ops backup prune`
- `npm run verify:recovery`
- additive health and doctor recovery signals
- updated automations:
  - `Midday Health Guard`
  - `End-of-Day Recovery Snapshot`
  - `Weekly Recovery Rehearsal Reminder`
- updated docs:
  - `docs/AUTOMATIONS.md`
  - `OPERATIONS.md`
  - `QUICK-GUIDE.md`
  - `RELEASING.md`
  - `docs/POST-LAUNCH-ROADMAP.md`
  - `docs/POST-LAUNCH-PHASE-3-ROLLOUT.md`

## Verification target

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`
- live sanity for:
  - `personal-ops health check`
  - `personal-ops health check --deep --json`
  - `personal-ops backup create --json`
  - `personal-ops backup prune --dry-run --json`
  - `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`
