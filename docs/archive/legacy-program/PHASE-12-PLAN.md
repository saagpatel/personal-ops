# Phase 12 Plan

Date: 2026-03-24
Status: Complete

## Goal

Make `personal-ops` easier to trust at a glance by separating active work from history, exposing filtered planning analytics, and using recent closure outcomes to calibrate planning quality without widening any mutation scope.

## Scope

Phase 12 stays on schema `12` and remains derived/read-first.

Delivered scope:

- explicit `active_count` and `historical_count` in `status` for tasks, task suggestions, and planning recommendations
- filtered planning backlog reads by:
  - `group`
  - `kind`
  - `source`
  - `stale_only`
  - `manual_only`
  - `resurfaced_only`
- filtered planning closure reads by:
  - `days`
  - `group`
  - `kind`
  - `source`
  - `close_reason`
- filter echoes in backlog and closure JSON payloads
- group-level closure-mix context in backlog groups and grouped recommendation detail:
  - `closed_last_30d`
  - `completed_last_30d`
  - `handled_elsewhere_last_30d`
  - `source_resolved_last_30d`
  - `dominant_close_reason_last_30d`
- `status.planning_recommendations.top_hygiene_summary`
- conservative ranking calibration for `system_generated` recommendations only
- ranking-version bump to `phase12-v1`

## Guardrails

Phase 12 does not:

- add a schema migration
- add direct assistant calendar writes
- add automatic recommendation apply
- widen grouped mutation scope
- create a new queue or history subsystem
- add provider-side fallback outside `personal-ops`

## Implementation Notes

The implementation stays inside the existing recommendation model:

- analytics remain derived from durable recommendation rows
- active-versus-history clarity is added in read models and status shaping
- backlog and closure filters are normalized once and reused across CLI, HTTP, and MCP
- calibration uses the last 30 days of closed recommendations keyed by:
  - `group_key`
  - `kind`
  - `source`
- calibration only activates with a minimum closed-sample size of `3`
- calibration adjusts ranking and explanation text only

## Verification Targets

- `npm run typecheck`
- `npm test`
- live daemon restart on the shared machine
- `personal-ops doctor --deep --json`
- `personal-ops status --json`
- `personal-ops worklist --json`
- `personal-ops recommendation summary --json`
- `personal-ops recommendation backlog --json`
- `personal-ops recommendation backlog --group urgent_inbox_followups --source system_generated --json`
- `personal-ops recommendation closure --days 30 --close-reason rejected_handled_elsewhere --json`
- one low-risk live operator action with cleanup

## Documentation Closeout

Phase 12 requires:

- `docs/PHASE-12-PLAN.md`
- `docs/PHASE-12-ROLLOUT.md`
- `README.md`
- `CLIENTS.md`
- `docs/2026-03-24-system-audit.md`
