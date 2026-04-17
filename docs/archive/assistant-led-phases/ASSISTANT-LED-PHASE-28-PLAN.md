# Assistant-Led Phase 28: Repair and Maintenance Convergence

## Summary

Phase 28 makes recurring maintenance and active repair feel like one clear lifecycle instead of two overlapping voices.

Chosen defaults:

- this is the assistant-led Phase 28, separate from the repo's older legacy `Phase 28` governance work
- no new HTTP routes, MCP tools, browser mutation paths, maintenance commands, SQLite tables, or persistence
- build entirely on top of the existing repair plan, maintenance follow-through, escalation, commitment, confidence, operating-block, and decision-explanation layers
- active repair still owns the queue whenever the same family is already in repair
- Cluster B remains open after this phase and does not merge until Phase 29

## Delivered shape

- add one shared `maintenance_repair_convergence` summary
- derive it from existing repair and maintenance signals only
- support these convergence states:
  - `repair_owned`
  - `repair_priority_upkeep`
  - `maintenance_owned`
  - `quiet_preventive`
  - `none`
- keep the canonical commands unchanged:
  - `personal-ops repair plan` when the family is `repair_owned`
  - `personal-ops maintenance session` otherwise

## Surface rules

- `repair plan` shows convergence before parallel maintenance detail
- `maintenance session` uses convergence to suppress "start maintenance now" wording when repair already owns the family
- `status`, `worklist`, and the console show one compact convergence summary instead of competing repair-versus-maintenance prose
- `workflow now-next` and `workflow prep-day` only show convergence wording when the surfaced maintenance family matches the converged family
- `maintenance_escalation` remains the only promoted maintenance queue item

## Guardrails

- no new persistence
- no new execution path
- no new commands
- no new queue kinds
- no change to `compareAttentionItems()`
- no change to repair-first or urgent-work-first precedence

## Cluster note

Cluster B remains open after Phase 28.

- Phase 27: Queue Personalization Without Unsafe Autonomy
- Phase 28: Repair and Maintenance Convergence
- Phase 29: Console and Desktop Workspace Maturity

Phase 29 is still the cluster closeout and merge point.
