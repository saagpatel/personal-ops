# Assistant-Led Phase 12 Plan

## Summary

Phase 12 turns the review outcomes and trend layers into a concrete calibration system.

The operator can now compare current review behavior against explicit targets, inspect where each surface is off track, and decide what manual tuning action should happen next without widening trust boundaries.

## Delivered

- persisted `review_calibration_targets` with one global target and optional per-surface overrides
- balanced default targets:
  - acted-on rate `>= 40%`
  - stale-unused rate `<= 30%`
  - negative feedback rate `<= 25%`
  - notification action conversion `>= 15%`
  - fired notifications `<= 7` per 7-day window
- `personal-ops review calibration`
- `personal-ops review calibration targets`
- `personal-ops review calibration targets set`
- `personal-ops review calibration targets reset`
- `GET /v1/review/calibration`
- `GET /v1/review/calibration/targets`
- `PUT /v1/review/calibration/targets/:scopeKey`
- `DELETE /v1/review/calibration/targets/:scopeKey`

## Calibration Rules

- calibration compares the trailing 14 days against the prior 14-day window
- notification budget pressure compares the trailing 7 days against the prior 7-day window
- metric status is `on_track`, `watch`, or `off_track`
- the `watch` band uses a 10% relative buffer around the configured target
- global targets apply by default; surface overrides inherit every unspecified field from global
- recommendations are deterministic and advisory only:
  - `insufficient_evidence`
  - `tighten_notification_budget`
  - `review_package_composition`
  - `inspect_source_suppression`
  - `revisit_surface_priority`
  - `keep_current_tuning`

## Guardrails

- review remains a derived overlay
- no calibration output changes raw worklist visibility
- no calibration output changes core workflow ranking
- console stays read-only for calibration targets
- only bearer-authenticated operator clients may change calibration targets

## Completion Standard

Phase 12 is complete when:

- calibration targets can be read, partially updated, and reset safely
- calibration reports show target-vs-actual posture globally and per surface
- status exposes compact calibration posture without expanding assistant-safe visibility
- console renders calibration findings without adding browser mutation authority
- verification passes:
  - `npm run typecheck`
  - `npm test`
  - `npm run verify:all`
