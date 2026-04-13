# Assistant-Led Phase 25: Operating Blocks and Maintenance Budgeting

## Summary

Phase 25 makes maintenance timing feel deliberate without adding any new authority or saved planning state.

This phase stays read-only and derived-only:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no new maintenance commands
- no new SQLite tables or persistence

The implementation builds on:

- `maintenance_scheduling`
- `maintenance_confidence`
- `maintenance_commitment`
- existing worklist pressure
- existing workflow bundle surfaces

## Delivered Shape

- added a shared `maintenance_operating_block` summary
- added descriptive operating blocks:
  - `current_block`
  - `later_today`
  - `calm_window`
  - `suppressed`
- derived operating-block guidance from the existing scheduling model instead of replacing it
- surfaced the same operating-block summary through:
  - `status`
  - `worklist`
  - `now-next`
  - `workflow prep-day`
  - `repair plan`
  - `maintenance session`
  - console repair and maintenance views

## Guardrails Preserved

- no new write path was added
- no new SQLite table or schema change was added
- `personal-ops maintenance session` remains the only maintenance execution path
- `maintenance_escalation` remains the only promoted maintenance queue item
- active repair and urgent concrete work still outrank maintenance

## Verification Plan

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
