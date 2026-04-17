# Assistant-Led Phase 36 Rollout

Date: 2026-04-14
Status: Complete

## Intent

Phase 36 was the prepared handoff consistency review.

The goal was **not** to rewrite review/approval wording again.

It was to prove whether the prepared-handoff surfaces still described one canonical grouped handoff after Phases 32 through 35, then remove only the duplicate narrative that was still competing with that handoff.

## What shipped

Phase 36 shipped one bounded product cleanup and one bounded documentation upgrade.

Product cleanup:

- assistant queue no longer surfaces generic or upstream review actions as competing dominant paths when the same grouped outbound handoff already owns the prepared work

Documentation upgrades:

- a dedicated Phase 36 plan artifact
- a dedicated Phase 36 audit ledger
- a rollout record with explicit cleanup accounting
- roadmap and onboarding truth updated to show Phase 36 complete and Phase 37 next

## What was reviewed

Phase 36 reviewed these surfaces together:

- workspace focus
- top assistant guidance
- Drafts
- Outbound Finish-Work
- Approvals
- console Overview
- console section-level handoff copy for Drafts / Approvals / Outbound

## What changed

The only product cleanup was inside assistant queue composition.

When grouped outbound already owns the prepared handoff, the queue now suppresses:

- `assistant.review-top-attention` when it would duplicate that same grouped outbound target
- the upstream inbox draft-group assistant action for that same group
- generic draft and approval review actions for work already represented inside the grouped handoff

This keeps grouped outbound as the canonical assistant-prepared path without changing lifecycle, transport, or authority.

## What stayed and why

These surfaces stayed materially the same:

- workspace focus
- status-level `review_approval_flow`
- Drafts copy
- Approvals copy
- console Overview supporting copy
- console section-level grouped handoff guidance

They stayed because the audit found them aligned and useful once the duplicate queue narrative was removed.

No broader wording pass was justified.

## What was removed

Removed from grouped-handoff states:

- the duplicate generic top-attention assistant action for the same grouped outbound target
- the duplicate upstream inbox review action for that same grouped handoff
- generic draft and approval queue actions for artifacts already covered by grouped outbound

## Cleanup ledger

Cleaned up:

- duplicate assistant queue paths for one grouped handoff
- stale roadmap and onboarding wording that still described earlier assistant-led current truth
- missing Phase 36 plan and audit artifacts

Intentionally kept:

- existing grouped handoff wording in console Overview, Drafts, and Approvals
- existing proof-gated review/approval presentation from Phase 34
- existing verifier ownership split from Phase 35

## Verification

Phase 36 verification completed with:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Phase 36 specifically added or tightened coverage for:

- service-level grouped-handoff precedence
- suppression of duplicate assistant queue actions when grouped outbound is canonical
- console agreement across Overview, Drafts, and Approvals in one grouped-handoff state

## Guardrails preserved

Phase 36 did **not** add:

- new routes
- new commands
- new MCP tools
- new queue kinds
- schema or persistence changes
- lifecycle or calibration changes
- auth, origin, session, or browser-safe boundary changes
- broader console asset exposure

This remained a bounded consistency-and-cleanup phase.

## Next phase

### Assistant-Led Phase 37: Verification and Docs Simplification

Phase 37 should simplify the confidence scaffolding around the assistant-led roadmap now that the prepared-handoff contract is stable.

It should:

- reduce verification duplication that no longer adds confidence after Phases 35 and 36
- simplify documentation routing and closeout scaffolding while preserving explicit artifact roles
- keep deterministic tests as the owner of product semantics and keep browser verification narrow
- avoid another wording pass unless simplification itself exposes a new contradiction

The phase should remain bounded:

- no new product authority
- no lifecycle or transport redesign
- no schema expansion
- no browser-safe scope widening

## Remaining roadmap note

- **Phase 38**: compact the assistant-led history into durable summaries once verification, documentation, and prepared-handoff scaffolding have stopped moving
