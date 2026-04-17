# Assistant-Led Phase 34 Plan

Date: 2026-04-13
Status: Complete

## Goal

Use the bounded Phase 33 calibration evidence to decide whether another review/approval surface adjustment is actually justified, and only then make one narrow presentation change without widening trust, lifecycle, or transport scope.

## Starting Point

Phase 32 aligned the prepared review/approval/send handoff across:

- `personal-ops status`
- workspace focus
- top assistant guidance
- Drafts
- grouped outbound
- Approvals
- the console-backed desktop shell

Phase 33 added one bounded outcome-memory and calibration layer on top of that same handoff.

That means Phase 34 is **not** starting from a missing surface.

It is starting from an already-coupled read-model stack where:

- primary handoff selection already exists
- follow-through outcomes are already tracked
- calibration is already attached to the current handoff
- status and console already render the handoff differently enough to drift if changed casually

The next question is not:

- can we redesign review, approval, and send again?

It is:

- does the current calibration evidence justify one more bounded presentation adjustment?
- if so, what is the smallest durable change that clarifies the handoff without changing how it is selected, stored, or acted on?

## Entry Gate

Phase 34 may implement a visible surface adjustment only if all of the following are true for the current primary handoff:

- `calibration.eligible === true`
- `calibration.status === "attention_needed"`
- `calibration.recommendation_kind === "consider_decision_surface_adjustment"`
- `supporting_summary` is present
- `sample_count_14d >= 4`

If that gate is not met, the correct Phase 34 result is:

- no visible handoff adjustment

That is still a valid completion of the phase.

## Scope

Phase 34 delivers:

- one explicit contract for when a review/approval surface adjustment is justified
- one bounded presentation adjustment through the existing `ReviewApprovalFlowSummary`
- one canonical composition rule so status and console tell the same primary handoff story
- deterministic seam coverage expansion in `npm test` where the current test stack still leaves real gaps
- workflow hardening only if the expanded deterministic test stack still leaves an enforcement gap

Phase 34 does **not** deliver:

- no `pickFlowCandidate` changes
- no handoff-identity changes
- no outcome-storage or closure-semantic changes
- no calibration-heuristic changes
- no schema migrations
- no new HTTP routes
- no new MCP tools
- no new CLI commands
- no browser authority expansion
- no dependency refresh bundle
- no transport redesign

## Canonical Behavior

### Composition ownership

The status-style review/approval handoff narrative is the canonical composition owner for this phase.

Console rendering must conform to the same:

- primary handoff target
- command precedence
- proof-triggered secondary explanation

### Proof-false behavior

When the Phase 34 entry gate is not met:

- preserve Phase 33-equivalent rendering
- keep the primary handoff summary unchanged
- keep calibration explanatory and secondary
- do not promote any secondary explanation

### Proof-true behavior

When the Phase 34 entry gate is met:

- promote exactly one secondary explanation from the existing `supporting_summary`
- keep the primary handoff summary primary
- keep calibration explanatory and secondary
- remove redundant generic console focus wording when it repeats the same handoff intent

### Stability rules

- grouped outbound remains structurally primary whenever it exists
- no lifecycle routing changes are allowed in this phase
- no new fallback hierarchy may be introduced beyond the current selected `ReviewApprovalFlowSummary`

## Implementation Shape

### Semantics first

Freeze the exact proof-false and proof-true behavior before introducing any shared helper.

If the final implementation still needs a shared helper after semantics are frozen, it must remain:

- purely compositional
- local to the existing review/approval presentation path
- unable to change selection, lifecycle, or storage behavior

### Test-first risk reduction

Prefer strengthening deterministic `npm test` coverage before adding a new heavyweight verify script.

The expected first additions are:

- service tests for the Phase 34 entry gate and proof-false fallback
- formatter/console parity tests around the same handoff
- MCP seam tests for review/approval tool contracts where current coverage is still shallow
- only the missing CLI/HTTP seam coverage beyond the current console and service tests

If that expanded deterministic stack still leaves a meaningful enforcement gap, Phase 34 may then add one narrow workflow gate.

## Verification Plan

Required local gates before merge:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Direct coverage should include:

- entry-gate true and false cases
- explicit no-change fallback when the gate fails
- status and console aligning on the same primary target and command precedence
- proof-triggered promotion of `supporting_summary` and only one promoted secondary explanation
- calibration remaining secondary in both proof-false and proof-true cases
- unchanged grouped outbound precedence
- unchanged review, approval, and send lifecycle behavior
- MCP review/approval contract checks where current coverage is still missing

If CI or release workflow changes are needed, the phase must also update and re-verify:

- `app/test/hardening.test.ts`

## Closeout Contract

Before Phase 34 is called complete:

- update `docs/ASSISTANT-LED-PHASE-34-ROLLOUT.md`
- update the roadmap again so Phase 34 is marked complete and the next target is named
- verify every planned Phase 34 item is complete
- confirm no unrelated dirty changes remain
- complete branch, PR, merge, post-merge CI wait, local `main` sync, and branch cleanup

The roadmap must not be marked complete until:

- the rollout doc exists
- the merge is done
- post-merge CI on `main` is green
