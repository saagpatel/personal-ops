# Assistant-Led Phase 24: Commitment Confidence and Escalation Decay

## Summary

Phase 24 makes maintenance pressure smarter without adding any new authority.

This phase stays derived-only:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no new maintenance commands
- no new persistence

The implementation builds on:

- `maintenance_commitment`
- `maintenance_defer_memory`
- `maintenance_escalation`
- `maintenance_scheduling`
- repair execution history

## Delivered Shape

- added a shared `maintenance_confidence` summary
- added descriptive confidence levels:
  - `low`
  - `medium`
  - `high`
- added descriptive confidence trends:
  - `rising`
  - `steady`
  - `cooling`
- derived confidence from commitment state, defer memory, escalation, scheduling placement, and recent maintenance outcomes
- surfaced the same confidence summary through:
  - `status`
  - `worklist`
  - `now`
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
