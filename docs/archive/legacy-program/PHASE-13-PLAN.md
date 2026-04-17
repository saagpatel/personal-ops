# Phase 13 Plan

Date: 2026-03-24
Status: Complete

## Goal

Make the planning queue easier to tune by exposing advisory backlog-hygiene signals, showing when one family dominates the active queue, and distinguishing externalized workflow patterns from source-side resolution without widening any mutation boundary.

## Scope

Phase 13 stays on schema `12` and remains read-first and advisory-only.

Delivered scope:

- a new derived `recommendation hygiene` report across CLI, HTTP, and assistant-safe MCP reads
- hygiene families keyed by:
  - `group_key`
  - `kind`
  - `source`
- hygiene filters:
  - `group`
  - `kind`
  - `source`
  - `candidate_only`
- advisory closure signals:
  - `insufficient_history`
  - `healthy_completed`
  - `mostly_handled_elsewhere`
  - `mostly_source_resolved`
  - `mixed`
- advisory recommended actions:
  - `keep_visible`
  - `review_externalized_workflow`
  - `review_source_suppression`
  - `need_more_history`
- queue-share visibility in planning backlog groups:
  - `queue_share_pct`
  - `dominates_queue`
- richer status shaping:
  - `dominant_backlog_summary`
  - `top_suppression_candidate_summary`
  - `top_hygiene_summary` now mirrors the suppression-candidate summary for compatibility
- closure-meaning summaries in:
  - closure totals and breakdowns
  - backlog groups
  - grouped recommendation detail
  - hygiene family rows

## Guardrails

Phase 13 does not:

- add a schema migration
- add durable suppression state
- add automatic suppression
- add automatic closure or hiding
- change Phase 12 ranking thresholds or score deltas
- widen grouped mutation scope
- widen assistant mutation scope
- introduce direct Gmail or direct Calendar fallback outside `personal-ops`

## Implementation Notes

The implementation builds on the Phase 12 analytics layer instead of creating a new subsystem:

- hygiene family stats reuse the same 30-day closure evidence and minimum sample size of `3` closed rows
- advisory recommendations are derived from the same family rollups used by the existing calibration logic
- ranking stays on `phase12-v1`; Phase 13 changes explanation and visibility only
- closure-meaning text now treats tied closure mixes as mixed rather than pretending one signal clearly dominates
- active queue-share reporting is computed only from currently open recommendation families

## Verification Targets

- `npm run typecheck`
- `npm test`
- live daemon restart on the shared machine
- `personal-ops doctor --deep --json`
- `personal-ops status --json`
- `personal-ops worklist --json`
- `personal-ops recommendation summary --json`
- `personal-ops recommendation backlog --json`
- `personal-ops recommendation closure --json`
- `personal-ops recommendation hygiene --json`
- `personal-ops recommendation hygiene --candidate-only --json`
- one low-risk live operator action with cleanup

## Documentation Closeout

Phase 13 requires:

- `docs/PHASE-13-PLAN.md`
- `docs/PHASE-13-ROLLOUT.md`
- `README.md`
- `CLIENTS.md`
- `docs/2026-03-24-system-audit.md`
