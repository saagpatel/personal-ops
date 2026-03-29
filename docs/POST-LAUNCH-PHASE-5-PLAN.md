# Post-Launch Phase 5: Workflow Actions and Bundles

## Summary

Phase 5 makes `personal-ops` more operationally helpful at the start of the day by composing the existing inbox, calendar, task, planning, and health signals into bounded workflow bundles.

Primary focus:

- day-start loop first
- read-first bundle generation
- exact CLI handoff instead of a new bulk workflow executor
- no browser mutation expansion

## Delivered shape

Public additions in this phase:

- `personal-ops workflow prep-day`
- `personal-ops workflow follow-up-block`
- `personal-ops workflow prep-meetings`
- `GET /v1/workflows/prep-day`
- `GET /v1/workflows/follow-up-block`
- `GET /v1/workflows/prep-meetings`

Shared workflow JSON shape:

- `workflow`
- `generated_at`
- `readiness`
- `summary`
- `sections`
- `actions`
- `first_repair_step`

## Implementation goals

- make `workflow prep-day` the preferred operator day-start command
- keep bundle generation compositional over the existing worklist, status, inbox, calendar, and planning layers
- surface the day-start bundle in the console Overview without adding a new top-level section
- let workflow actions deep-link into existing console detail views where possible
- update Morning Brief to source from `personal-ops workflow prep-day --json`

## Guardrails

- no new planning store
- no `workflow apply`
- no approval, send, restore, or auth widening
- no new browser mutations
- higher-trust actions stay in the existing CLI paths
