# Assistant-Led Phase 22: Queue-Aware Maintenance Scheduling

## Summary

Phase 22 makes maintenance timing explicit without widening authority.

This phase stays derived-only:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no new persistence layer
- no new maintenance commands

The implementation decides where the top maintenance cue belongs:

- `now`
- `prep_day`
- `calm_window`
- `suppressed`

## Delivered Shape

- a derived `maintenance_scheduling` summary layered onto the existing maintenance window and escalation model
- deterministic placement rules based on:
  - readiness
  - active repair for the same family
  - urgent concrete work already in the queue
  - the existing maintenance quiet period
- additive visibility across:
  - `status`
  - `worklist`
  - `now`
  - `workflow prep-day`
  - `repair plan`
  - `maintenance session`
  - console repair and maintenance views

## Guardrails Preserved

- active repair still outranks maintenance
- urgent concrete work still outranks maintenance
- `maintenance_escalation` remains the only promoted queue-visible maintenance item
- ordinary preventive maintenance still does not become a first-class queue item by itself
- `personal-ops maintenance session` remains the only maintenance execution path

## Verification Plan

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
