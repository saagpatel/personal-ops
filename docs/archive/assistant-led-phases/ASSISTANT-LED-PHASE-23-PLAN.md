# Assistant-Led Phase 23: Maintenance Commitments and Defer Memory

## Summary

Phase 23 makes scheduled maintenance harder to silently ignore without widening authority.

This phase adds one small local memory source:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no new maintenance commands
- no planning recommendation, task, or automation creation path

The implementation stores commitment memory only for scheduled maintenance surfaced in:

- `now`
- `prep_day`

## Delivered Shape

- added a local `maintenance_commitments` SQLite table
- added commitment states:
  - `active`
  - `completed`
  - `handed_off_to_repair`
  - `superseded_by_repair`
  - `expired`
- added shared commitment and defer-memory summaries to:
  - `status`
  - `worklist`
  - `now`
  - `workflow prep-day`
  - `repair plan`
  - `maintenance session`
  - console repair and maintenance views

## Guardrails Preserved

- `personal-ops maintenance session` remains the only maintenance execution path
- calm-window upkeep remains guidance-only and does not create a commitment
- active repair still outranks maintenance
- urgent concrete work still outranks maintenance
- browser and console remain read-only consumers

## Verification Plan

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
