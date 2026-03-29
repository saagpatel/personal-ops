# Post-Launch Phase 6: Intelligence Layer

## Summary

Phase 6 makes `personal-ops` better at answering one operator question: what should I do next, right now?

Primary focus:

- deterministic next-move ranking
- better `why_now` guidance
- stronger day-start ordering
- no browser mutation expansion
- no schema changes

## Delivered shape

Public additions in this phase:

- `personal-ops workflow now-next`
- `GET /v1/workflows/now-next`
- additive workflow fields:
  - `why_now`
  - `score_band`
  - `signals`

Shared workflow JSON shape stays:

- `workflow`
- `generated_at`
- `readiness`
- `summary`
- `sections`
- `actions`
- `first_repair_step`

## Implementation goals

- make `workflow now-next` the focused in-the-moment operator command
- improve ranking across tasks, planning, inbox, meetings, and readiness repair
- keep workflow ranking deterministic and explainable
- upgrade `prep-day`, `follow-up-block`, and `prep-meetings` to use the same intelligence layer
- surface the new guidance in the console Overview and Morning Brief

## Guardrails

- no embedded model calls inside `personal-ops`
- no schema changes
- no bulk workflow executor
- no new browser mutation scope
- higher-trust actions stay in the existing CLI paths
