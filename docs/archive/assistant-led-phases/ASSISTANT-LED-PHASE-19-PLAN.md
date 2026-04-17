# Assistant-Led Phase 19: Maintenance Sessions and Safe Bundle Execution

## Summary

Phase 19 turns the calm-window maintenance bundle from Phase 18 into a bounded CLI-only maintenance session.

This phase stays narrow:

- no new HTTP routes
- no new MCP tools
- no browser execution path
- no new SQLite tables
- no batch "run all" behavior

The operator can now start one maintenance session, run the next safe upkeep step, and see whether the session completed, advanced, or handed off back to active repair.

## Delivered Shape

- `personal-ops maintenance session`
  - shows the current maintenance session plan when the calm window is eligible
  - otherwise explains the current deferred reason
- `personal-ops maintenance run next`
  - runs only the first safe step in the active maintenance session
  - never skips ahead
  - never runs a whole bundle at once
- maintenance execution writes into the existing `repair_executions` table using `trigger_source = "maintenance_run"`
- read-only surfaces now point to the session start command instead of treating each calm-window item like a standalone action

## Boundaries Preserved

- maintenance execution remains CLI-only
- browser and console stay read-only
- repair still outranks maintenance
- concrete operator work still outranks maintenance
- no new daemon or background automation path was added

## Verification Plan

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
