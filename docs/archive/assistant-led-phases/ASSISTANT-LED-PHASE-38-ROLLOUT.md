# Assistant-Led Phase 38 Rollout

Date: 2026-04-14
Status: Complete

## Intent

Phase 38 finished the assistant-led track by compacting its history into durable summaries and reducing the amount of current-truth scaffolding contributors need to read.

The goal was not to change product behavior.

It was to leave the repo with one clear current-truth path and one clear assistant-led historical summary.

## What shipped

Phase 38 shipped one documentation-architecture cleanup.

- a new `docs/ASSISTANT-LED-HISTORY-SUMMARY.md` now carries the durable assistant-led historical story
- the roadmap now stays focused on current truth, final status, compact phase ledger, and preserved rules
- onboarding docs now route current readers, assistant-led historical readers, and legacy historical readers more clearly
- docs-navigation enforcement now protects artifact roles and routing instead of terminal next-phase phrasing

## What was reviewed

Phase 38 reviewed these artifacts together:

- `docs/ASSISTANT-LED-ROADMAP.md`
- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md`
- `docs/PROGRAM-COMPLETE-SUMMARY.md`
- `README.md`
- `START-HERE.md`
- `docs/NEW-MACHINE-SETUP.md`
- `app/test/docs-navigation.test.ts`

## What changed

The main historical compaction was artifact reassignment.

- the roadmap stopped carrying the detailed assistant-led narrative for every completed phase
- the new assistant-led history summary now carries the durable historical story for the assistant-led track
- the earlier program summary stays limited to the pre-assistant-led history through Phase 33
- current entrypoints now route readers to the right layer instead of relying on one oversized roadmap plus scattered rollout context

The main governance cleanup was terminalization.

- docs-navigation now protects current-truth versus historical-truth routing without depending on "Phase 38 next" wording
- the assistant-led roadmap now ends in an explicit completed state
- the repo no longer needs future assistant-led phase handoff wording

## What stayed and why

These layers stayed intentionally separate:

- roadmap versus current phase plan versus current phase rollout versus historical summaries
- assistant-led historical context versus the earlier pre-assistant-led program history
- technical contract docs like `CLIENTS.md` and `ARCHITECTURE.md` versus initiative-status docs

They stayed because that separation is what keeps current truth, implementation history, and legacy context from collapsing into one ambiguous document.

## What was removed

Removed or narrowed in Phase 38:

- detailed completed-phase scaffolding from the roadmap once its unique historical value had a new durable home
- repeated onboarding phrasing that treated the roadmap and older historical docs as if they served the same job
- terminal next-phase coupling in docs-navigation enforcement

## Cleanup ledger

Cleaned up:

- roadmap history overload
- repeated routing prose across current-truth entrypoints
- brittle docs-navigation dependence on terminal next-phase wording

Intentionally kept:

- old assistant-led phase plan and rollout docs in place as searchable archive/reference
- `PROGRAM-COMPLETE-SUMMARY.md` as legacy historical context only
- current verification and workflow topology
- current trust and browser-safe boundaries

## Verification

Phase 38 verification completed with:

- `npm run typecheck`
- `npm test`

Phase 38 specifically tightened coverage around:

- current-truth routing
- historical-summary routing
- artifact-role hierarchy after the assistant-led track reached its terminal state

## Guardrails preserved

Phase 38 did **not** add:

- product-semantic changes
- lifecycle, calibration, or queue-precedence changes
- auth, origin, session, route, or browser-safe boundary changes
- console asset exposure changes
- browser-visible payload or identifier expansion
- package script, CI, release, or verifier topology changes

## Next phase

There is no later assistant-led phase.

The assistant-led track is complete.

## Remaining roadmap note

- No later assistant-led phases remain after Phase 38 in the current roadmap.
