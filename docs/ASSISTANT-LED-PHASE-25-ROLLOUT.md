# Assistant-Led Phase 25 Rollout Record

## Summary

Phase 25 is complete and live in the assistant-led maintenance track.

This phase adds explicit operating-block guidance for maintenance without introducing a scheduler or a new planning system.

## What Changed

- added a derived `maintenance_operating_block` summary for the top maintenance family
- kept operating blocks descriptive instead of stateful:
  - `current_block`
  - `later_today`
  - `calm_window`
  - `suppressed`
- surfaced the same operating-block summary through:
  - `status`
  - `worklist`
  - `now-next`
  - `prep-day`
  - `repair plan`
  - `maintenance session`
  - console repair and maintenance views

## Examples

- an escalation-backed maintenance family can now be shown as belonging in the current operating block
- maintenance that should happen today but not immediately can now be budgeted into a later-today upkeep block
- calm-window maintenance stays available as quieter guidance instead of being promoted into the active queue
- the same command remains the entrypoint in every surface: `personal-ops maintenance session`

## Guardrails Preserved

- no new HTTP or MCP surfaces were added
- no browser execution path was added
- no new persistence layer was added
- no saved operating-block planner was added
- no new maintenance commands were added
- active repair and urgent concrete work still stay ahead of maintenance

## Verification

Phase 25 closeout requires all of these to pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
