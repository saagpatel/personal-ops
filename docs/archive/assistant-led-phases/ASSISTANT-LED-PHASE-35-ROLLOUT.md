# Assistant-Led Phase 35 Rollout

Date: 2026-04-14
Status: Complete

## Intent

Phase 35 was the assistant-led review surface stability check.

The goal was **not** to invent another review/approval wording change.

It was to prove that the shipped Phase 34 proof-gated presentation could remain the default while the surrounding workflow, verifier, and documentation layers were cleaned up and the assistant-led closeout contract was strengthened for the future.

## What shipped

Phase 35 shipped five concrete improvements:

- release workflow parity with CI for browser-backed tests by installing Playwright Chromium before `npm run release:check:ci`
- a hardening guard that protects release browser-prerequisite parity alongside the existing CI guard
- one narrow `verify-console` scenario that validates the shipped proof-gated review/approval browser behavior end to end
- neutral verifier success banners for `verify:smoke`, `verify:full`, and `verify:console`
- current-truth versus historical-truth documentation cleanup across the main onboarding path

## What was reviewed and cleaned up

Phase 35 ended with an explicit review-and-cleanup pass over the work it touched.

Reviewed:

- the shipped Phase 34 proof gate and supporting explanation behavior
- the release workflow path that runs `release:check:ci`
- the named console verifier ownership boundary
- the main onboarding and history documentation chain

Cleaned up:

- release/CI browser prerequisite drift
- stale phase-era verifier banners
- stale onboarding wording that still described the assistant-led roadmap as only through Phase 8
- stale summary framing that still presented Phase 33 completion as current system truth
- missing explicit artifact roles for roadmap, phase plan, rollout, and historical summary docs

No additional surface redesign was justified by this phase.

The Phase 34 proof-gated presentation remains the stable default.

## Guardrails preserved

Phase 35 did **not** add:

- new HTTP routes
- new MCP tools
- new user-facing commands
- new queue kinds or persistence
- new lifecycle or calibration behavior
- new browser authority
- a wider console asset boundary

This remained a bounded stability-and-cleanup phase.

## Verification

Local verification for the phase completed with:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Phase 35 specifically added or confirmed coverage for:

- release browser-prerequisite parity
- the proof-gated review/approval browser scenario in the named console verifier
- unchanged deterministic ownership of proof-gate logic, status/console alignment, and review/approval seams
- current-truth documentation routing through `app/test/docs-navigation.test.ts`

## Closeout rule now in effect

Starting with this phase, every completed assistant-led phase must end with:

- a review of what it built
- cleanup of what is no longer needed
- a summary of what shipped
- a detailed writeup of the next phase
- short one-line notes for the remaining roadmap phases

Artifact roles are now explicit:

- `docs/ASSISTANT-LED-ROADMAP.md` = current and future truth
- current assistant-led phase plan doc = implementation contract
- current assistant-led phase rollout doc = shipped summary and cleanup record
- `docs/PROGRAM-COMPLETE-SUMMARY.md` = historical snapshot and legacy context

## Next phase

### Assistant-Led Phase 36: Prepared Handoff Consistency Review

Phase 36 should review the now-stable prepared handoff surfaces together instead of treating review/approval in isolation.

It should:

- audit whether workspace focus, top assistant guidance, Drafts, Outbound Finish-Work, Approvals, and the console still tell the same handoff story after Phases 32 through 35
- remove redundant or stale handoff wording only when surfaces are clearly duplicating each other
- keep the same trust, lifecycle, and transport boundaries unless a proven contradiction requires escalation
- update deterministic coverage only where the consistency pass exposes real drift
- end with another explicit review-and-cleanup closeout

The phase should remain bounded:

- no new action authority
- no lifecycle rewrites for review, approval, send, or grouped outbound work
- no new product routes or commands
- no schema or persistence expansion

## Remaining roadmap notes

- **Phase 37**: simplify verification and documentation surfaces after the prepared handoff contract stops moving, removing duplication that no longer adds confidence
- **Phase 38**: compact the assistant-led history into durable summaries once the review-surface sequence is stable enough to stop carrying so much phase-by-phase scaffolding
