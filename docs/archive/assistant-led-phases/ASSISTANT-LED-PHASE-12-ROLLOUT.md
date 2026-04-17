# Assistant-Led Phase 12 Rollout

## Summary

Phase 12 is complete.

This phase adds explicit review calibration so the operator can judge review quality against targets instead of relying on rolling metrics alone.

## Delivered

- persisted calibration targets with global fallback and per-surface override support
- calibration reports over the existing review lifecycle, notification, trend, and tuning data
- operator-facing CLI and HTTP calibration surfaces
- console Review Calibration surface with:
  - global scorecard
  - surfaces off track
  - target-vs-actual comparisons
  - top noisy sources
  - recent tuning effect
  - recommended manual actions
- compact status fields for:
  - calibration status
  - surfaces off track
  - notification budget pressure
  - top calibration surface

## Default Targets Shipped

- acted-on rate `>= 40%`
- stale-unused rate `<= 30%`
- negative feedback rate `<= 25%`
- notification action conversion `>= 15%`
- fired notifications `<= 7` per 7-day window

## Trust Boundaries

Phase 12 keeps the existing assistant-led trust model intact:

- no new proposal generation loop was introduced
- no automatic tuning approval or rollback was introduced
- no calibration signal enters the core ranking engine
- no browser mutation path was added for calibration targets
- review remains a derived overlay and the raw worklist remains unchanged

## Verification

Verification target for this phase:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Targeted Phase 12 coverage includes:

- target bootstrap, inheritance, partial updates, and reset
- calibration grading for `on_track`, `watch`, and `off_track`
- zero-budget notification handling
- deterministic recommendation ordering
- operator-only calibration target mutation with browser-session read-only access
- additive status integration without changing ranking behavior

## Completed Work Review

Phase 12 adds the missing operator calibration layer on top of the Phase 10/11 review reporting stack.

The operator can now see:

- which surfaces are on track, on watch, or off track
- which metric is driving each off-track surface
- where notification volume is out of proportion to the value returned
- whether recent approved tuning appears worth keeping

Program-level result:

- Phase 9 made review intelligence safe
- Phase 10 made it measurable
- Phase 11 made it directional
- Phase 12 makes it calibratable without widening authority
