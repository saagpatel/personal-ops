# Assistant-Led Phase 33 Rollout

## Intent

Phase 33 is the assistant-led review outcome calibration phase, not the repo's older legacy `PHASE-33-*` track.

The goal is to use real review, approval, and send follow-through evidence to judge whether the Phase 32 handoff is already working well enough or whether the next bounded move should be more batching, review tuning, or another decision-surface pass.

- keep the current review/approval/send handoff primary
- add evidence about what actually happened after that handoff was surfaced
- keep calibration explanatory and secondary

## What shipped

Phase 33 adds one bounded `review_approval_flow_outcomes` memory layer plus one additive calibration summary attached to the existing `ReviewApprovalFlowSummary`.

The calibration summary answers:

- whether the current handoff still has too little evidence
- whether recent outcomes look `working`, `mixed`, or `attention_needed`
- whether the strongest next calibration move is:
  - keep the current handoff
  - consider more batching
  - consider review tuning
  - consider decision-surface adjustment

## Scenarios

### 1. Review handoff actually moves forward

When the primary handoff is surfaced at `review_needed` and the operator resolves that review:

- the surfaced handoff outcome closes as helpful
- the next surfaced handoff can calibrate against real recent follow-through
- the system does not need a new command or workflow to prove the step was useful

### 2. Approval handoff progresses into grouped finish-work

When the operator moves grouped work from review into approval and send-gated finish-work:

- the approval handoff counts as real progress
- send-window blocking is treated as a bounded finish-work gate, not automatically as failed calibration
- grouped handoffs can now build evidence that the current batching posture is already working

### 3. Weak singleton handoffs point toward more batching

When recent stalled outcomes are concentrated on singleton draft or approval handoffs while grouped work is still progressing:

- the calibration summary points toward more batching as the likeliest next adjustment
- the system still does not auto-batch or auto-approve anything

### 4. Review-stage stalls point toward review tuning

When recent stalled outcomes are concentrated at the review step:

- the calibration summary points toward review tuning as the likeliest next move
- review packages and tuning remain secondary and read-model only

### 5. Mixed stalls across the handoff point toward surface adjustment

When recent stalled outcomes are spread across review, approval, and send handoff states:

- the calibration summary points toward another decision-surface pass
- the current phase still stops short of redesigning those surfaces

## Surface behavior

Phase 33 updates only the existing shared handoff surfaces:

- `personal-ops status`
- workspace focus
- top assistant guidance
- the console-backed desktop shell

The phase does not change:

- review lifecycle transitions
- approval lifecycle transitions
- grouped outbound state transitions
- worklist ordering
- HTTP routes
- MCP routes
- user-facing command surfaces

## Guardrail proof

Phase 33 does not add:

- new user-facing commands
- new HTTP routes
- new MCP tools
- new approval, send, or review authority
- new browser mutation paths
- automatic batching or tuning decisions
- worklist ordering changes

This is a bounded outcome-memory and calibration-summary phase only.

## Next step

The intended next assistant-led target after this phase is:

- **Assistant-Led Phase 34: Review Surface Adjustment Proof**

Phase 34 should only touch the handoff surfaces further if the new Phase 33 calibration evidence keeps showing that another presentation pass is actually justified.
