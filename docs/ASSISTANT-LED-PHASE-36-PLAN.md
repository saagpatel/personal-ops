# Assistant-Led Phase 36 Plan

Date: 2026-04-14
Status: Complete

## Goal

Run a prepared-handoff consistency review across workspace focus, top assistant guidance, Drafts, Outbound Finish-Work, Approvals, and the console, then make only the smallest presentation cleanup needed to keep the grouped handoff canonical.

## Starting Point

Phases 32 through 35 already shipped the prepared-handoff stack:

- `review_approval_flow` chooses the current prepared handoff
- status and console already render grouped outbound as the primary review/approval/send path
- Phase 34 proof-gated supporting copy is already stable
- Phase 35 already hardened verifier ownership, closeout rules, and current-truth doc routing

That means Phase 36 is **not** a redesign phase.

It starts from a system where the likely risk is cross-surface duplication or precedence drift, not missing functionality.

## Contract

Phase 36 treats the existing service-level `review_approval_flow` projection as the leading candidate canonical owner for:

- prepared-handoff target identity
- primary summary
- primary command

The audit must verify that the surrounding surfaces still point to the same target and compatible next action.

Surfaces do **not** need identical wording.

They do need:

- the same underlying prepared-handoff target
- compatible next-step advice
- no competing dominant narrative once grouped outbound owns the handoff

## Fixed Audit Inventory

Review these surfaces together before visible cleanup:

1. workspace focus
2. top assistant guidance
3. Drafts
4. Outbound Finish-Work
5. Approvals
6. console Overview
7. console section-level handoff copy related to Drafts / Approvals / Outbound

## Boundaries

Phase 36 must not change:

- `pickFlowCandidate`
- review / approval / send lifecycle semantics
- grouped outbound lifecycle semantics
- calibration heuristics
- persistence or schema
- HTTP / CLI / MCP / queue interfaces
- auth, origin, session, route, or browser-safe boundaries
- current console asset exposure

Do not add a new abstraction unless the audit proves duplication remains unsafe after the existing semantics are frozen.

## Expected Outcome

The audit should first decide whether a visible cleanup change is even justified.

If the surfaces are already role-consistent, the correct result is no visible product change.

If a contradiction exists, it must stay bounded to presentation priority or duplicate narrative cleanup.

## Implementation Focus

The expected likely seam is top assistant guidance.

If grouped outbound already owns the prepared handoff, the assistant queue should not surface generic or upstream review actions as a second dominant path for that same prepared work.

That means Phase 36 should prefer:

- target-based suppression of duplicate assistant queue actions
- deterministic tests that prove grouped outbound remains canonical
- no broader wording churn when the console and status surfaces are already aligned

## Verification Plan

Required local verification before merge:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Deterministic coverage should own:

- target identity agreement
- assistant-queue precedence
- rendered agreement across Overview, Drafts, and Approvals

Browser verification should stay narrow and section-scoped.

## Closeout Contract

Before Phase 36 is called complete:

- write `docs/ASSISTANT-LED-PHASE-36-AUDIT.md`
- write `docs/ASSISTANT-LED-PHASE-36-ROLLOUT.md`
- update `docs/ASSISTANT-LED-ROADMAP.md`
- refresh onboarding wording that still points at stale assistant-led current truth
- verify the phase ends with:
  - a review of what it built
  - cleanup of what is no longer needed
  - a summary of what shipped
  - a detailed Phase 37 writeup
  - a short Phase 38 note
