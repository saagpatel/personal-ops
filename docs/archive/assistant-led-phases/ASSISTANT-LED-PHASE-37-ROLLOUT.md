# Assistant-Led Phase 37 Rollout

Date: 2026-04-14
Status: Complete

## Intent

Phase 37 simplified the verification and documentation scaffolding around the assistant-led roadmap after the prepared-handoff contract stopped moving.

The goal was not to change product behavior.

It was to make each verifier and each current-truth artifact own one clear job.

## What shipped

Phase 37 shipped one verification-boundary cleanup and one documentation simplification pass.

Verification cleanup:

- `verify:full` no longer owns restore behavior that already belongs in `verify:recovery`
- `verify:console` now focuses on narrow browser-critical console checks instead of duplicating prepared-handoff semantics
- deterministic governance tests now separate workflow topology, release semantics, and current-truth doc routing more cleanly
- stale verifier success banners now use durable phase-agnostic wording

Documentation simplification:

- a dedicated Phase 37 plan artifact records the ownership model
- current-truth docs now show Phase 37 complete and Phase 38 next
- `START-HERE.md` now routes historical readers to durable context docs instead of acting like a rollout archive index
- audit artifacts are now explicitly optional by default for future phases

## What was reviewed

Phase 37 reviewed these ownership seams together:

- `npm test`
- `verify:smoke`
- `verify:full`
- `verify:console`
- `verify:recovery`
- `hardening.test.ts`
- `release.test.ts`
- `docs-navigation.test.ts`
- roadmap, plan, rollout, onboarding, and historical summary roles

## What changed

The main verification cleanup was ownership reassignment.

- `verify:recovery` now remains the sole restore, rescue snapshot, prune, and rehearsal verifier
- `verify:full` now stays focused on broader CLI and backup-inspection sanity without repeating restore work
- `verify:console` now keeps browser-shell, snapshot, planning, and lock-screen canaries while dropping deterministic prepared-handoff assertions
- `release.test.ts` no longer duplicates workflow-shape checks already owned by `hardening.test.ts`
- `docs-navigation.test.ts` now checks current-truth routing and active artifact hierarchy instead of legacy rollout inventory

The main docs cleanup was role clarification.

- the roadmap remains the normative owner of the closeout rule
- the plan remains the implementation contract
- the rollout remains the shipped summary and cleanup record
- the historical summary remains historical context
- separate audit docs are no longer treated as required for every future phase

## What stayed and why

These layers stayed intentionally separate:

- `npm test` versus the `verify:*` operational gates
- local full verification versus the narrower CI/release baseline
- roadmap versus current phase plan versus current phase rollout versus historical summary
- browser-safe console boundaries and asset exposure

They stayed because that separation still adds real clarity and confidence.

## What was removed

Removed or narrowed in Phase 37:

- restore-path duplication from `verify:full`
- workflow-topology duplication from `release.test.ts`
- legacy rollout-history inventory checks from `docs-navigation.test.ts`
- stale phase-era verifier success banners
- onboarding links that treated early rollout docs like part of the main entry path

## Cleanup ledger

Cleaned up:

- overlapping verification ownership
- stale governance-test scope
- repetitive current-truth routing and history links

Intentionally kept:

- existing command names and CI/release shape
- deterministic test ownership of product semantics
- explicit artifact-role separation
- frozen browser/auth/session/asset boundaries

## Verification

Phase 37 verification completed with:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Phase 37 specifically tightened coverage around:

- verifier ownership boundaries
- current-truth doc routing
- browser-console canaries that are still unique after deterministic coverage

## Guardrails preserved

Phase 37 did **not** add:

- product-semantic changes
- lifecycle or calibration changes
- auth, origin, session, route, or browser-safe boundary changes
- console asset exposure changes
- browser-visible payload or identifier expansion
- CI or release baseline widening

## Next phase

### Assistant-Led Phase 38: Assistant-Led History Compaction

Phase 38 should compact the assistant-led history into durable summaries now that the verification boundary and current-truth scaffolding are stable.

It should:

- reduce how much phase-by-phase scaffolding current contributors need to read
- preserve the roadmap as current/future truth
- preserve the latest plan and rollout as the most recent active delivery artifacts
- decide which older assistant-led details should move into durable summary form versus remain only in historical rollout docs

The phase should remain bounded:

- no product authority changes
- no verification-policy redesign unless compaction exposes a real contradiction
- no browser-safe scope widening

## Remaining roadmap note

- No later assistant-led phases remain after Phase 38 in the current roadmap.
