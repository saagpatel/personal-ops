# Assistant-Led Phase 33 Plan

Date: 2026-04-13
Status: Complete

## Goal

Use real review, approval, and send follow-through evidence to judge whether the Phase 32 handoff is already working well enough or whether more batching, review tuning, or decision-surface adjustment is justified.

## Starting Point

Phase 32 aligned the main prepared handoff across status, workspace focus, assistant guidance, Drafts, grouped outbound, and Approvals.

That phase intentionally stopped at wording and handoff clarity:

- no new persistence
- no new commands
- no lifecycle changes
- no authority expansion

The next bounded question is not "can we redesign review and approval again?"

It is:

- when the current primary handoff is surfaced, does the operator actually move it forward?
- when follow-through is weak, is the likely next improvement more batching, review tuning, or a decision-surface change?

## Scope

Phase 33 delivers:

- a small additive outcome-memory layer for the current primary `ReviewApprovalFlowSummary`
- derived recent calibration over those outcomes for the bounded Phase 32 handoff only
- one calibration read model that says whether the handoff is:
  - still unproven
  - working
  - mixed
  - attention-needed
- one bounded recommendation for the next calibration posture:
  - keep the current handoff
  - consider more batching
  - consider review tuning
  - consider decision-surface adjustment
- additive rendering through the existing shared review/approval flow summary in:
  - `personal-ops status`
  - workspace focus
  - top assistant guidance
  - the console-backed desktop shell

Phase 33 does **not** deliver:

- no new HTTP or MCP routes
- no new user-facing commands
- no approval, send, or review lifecycle changes
- no new browser mutation paths
- no worklist ordering changes
- no automatic batching or automatic tuning decisions
- no change to review packages remaining secondary in this handoff

## Implementation Shape

### Outcome memory

Track the current primary review/approval flow only.

Each tracked outcome should keep:

- the stable flow target identity already used by Phase 32
- the flow state when it was surfaced
- enough context to tell whether it later:
  - progressed helpfully
  - regressed into recovery
  - was superseded by other work
  - expired without bounded follow-through

Keep the storage small and additive.

### Calibration summary

Derive one recent calibration summary from closed outcomes only.

It should answer:

- how much recent handoff evidence exists
- how often the surfaced handoff progressed
- how often it regressed, expired, or was superseded
- whether the evidence most strongly points toward:
  - leaving the current handoff alone
  - grouping more singleton work into batches
  - revisiting review tuning because review-stage follow-through is still weak
  - adjusting decision-surface emphasis because the handoff is still being passed over

### Surface behavior

Expose the calibration additively through the existing `ReviewApprovalFlowSummary` instead of creating a separate operator workflow.

Keep the UI behavior calm:

- the main handoff still stays primary
- calibration stays explanatory and secondary
- review packages and review tuning remain available but do not take over the finish-work path

## Verification Plan

Required gates:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Direct coverage should include:

- outcome tracking for `review_needed`, `approval_needed`, `send_ready`, `recovery_needed`, and `caught_up`
- helpful progression, regression to recovery, superseded handoffs, and expiry
- calibration summaries for:
  - insufficient evidence
  - working
  - mixed
  - attention-needed
- recommendation selection for:
  - keep current handoff
  - more batching
  - review tuning
  - decision-surface adjustment
- status, workspace focus, and top assistant guidance agreeing on the same calibration when they point at the same handoff
- unchanged review, approval, grouped outbound, and worklist behavior outside the additive read model

## Closeout Contract

Before Phase 33 is called complete:

- update `docs/ASSISTANT-LED-PHASE-33-ROLLOUT.md`
- update the roadmap again so Phase 33 is marked complete and the next target is named
- verify every planned Phase 33 item is complete
- confirm no unrelated dirty changes remain
- complete branch, PR, merge, post-merge CI wait, local `main` sync, and branch cleanup

## Default Next Target

If Phase 33 lands cleanly, the next sensible target is:

- Assistant-Led Phase 34: Review Surface Adjustment Proof
