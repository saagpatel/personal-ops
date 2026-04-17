# Assistant-Led Phase 26: Maintenance Decision Memory and Explainability

## Summary

Phase 26 makes maintenance guidance feel like one coherent decision instead of several overlapping hints.

This phase stays derived-only:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no new maintenance commands
- no new SQLite tables or persistence

The implementation builds on:

- `maintenance_follow_through`
- `maintenance_commitment`
- `maintenance_defer_memory`
- `maintenance_confidence`
- `maintenance_operating_block`
- `maintenance_scheduling`
- existing worklist pressure and readiness state

## Delivered Shape

- added a shared `maintenance_decision_explanation` summary
- added descriptive decision states:
  - `do_now`
  - `budget_today`
  - `calm_window`
  - `suppressed`
- added descriptive explanation drivers:
  - `commitment`
  - `escalation`
  - `confidence`
  - `operating_block`
  - `scheduling`
  - `repair_blocked`
  - `readiness_blocked`
- derived the top explanation from the existing maintenance stack instead of inventing new state
- surfaced the same explanation summary through:
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

## Cluster A Closeout

- Phase 26 is the merge point for the `24-26` maintenance-maturity cluster
- final cluster closeout requires:
  - `npm run typecheck`
  - `npm test`
  - `npm run verify:console`
  - `npm run verify:all`
- closeout should end with one PR and one merge for Phases 24, 25, and 26 together
