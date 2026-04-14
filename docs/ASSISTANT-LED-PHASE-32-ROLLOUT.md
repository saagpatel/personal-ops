# Assistant-Led Phase 32 Rollout

## Intent

Phase 32 is the assistant-led review and approval ergonomics phase, not the repo's older legacy `PHASE-32-*` audit-docs work.

The goal is to make prepared review, approval, and send work feel like one guided operator flow instead of several neighboring surfaces that describe the same handoff differently.

- improve the main operator path across Drafts, Approvals, grouped outbound, workspace focus, and assistant guidance
- keep review packages and tuning visible but secondary
- preserve the same authority boundaries, commands, and lifecycle rules

## What shipped

Phase 32 adds one shared `ReviewApprovalFlowSummary` read model with five states:

- `recovery_needed`
- `review_needed`
- `approval_needed`
- `send_ready`
- `caught_up`

It derives one primary prepared handoff from the existing review items, approval requests, drafts, grouped outbound state, and top assistant/workspace context.

## Scenarios

### 1. Grouped outbound is the primary path

When an approval belongs to a grouped outbound flow:

- grouped outbound becomes the primary forward path
- Drafts and outbound finish-work become the clearest place to continue review, approval, and send
- the operator does not need to reconstruct the handoff from separate queues

### 2. Approvals become recovery and inspection oriented in grouped cases

When grouped context already exists:

- Approvals still expose recovery controls and inspection detail
- approval detail becomes referential instead of presenting standalone approve/send as the main path
- grouped handoff wording points back to the current grouped flow

### 3. Workspace and assistant guidance align to the same handoff

When workspace focus and the top assistant action point at the same stable review or approval target:

- the workspace keeps the primary explanation
- the assistant action stays actionable
- repeated why-now and proof wording is suppressed
- the handoff reads like one operator decision path instead of multiple competing next moves

### 4. Supporting review context stays visible

Review packages and tuning proposals remain available:

- as supporting review context
- without taking over the primary review, approval, or send handoff copy

## Surface behavior

Phase 32 updates only the existing bounded surfaces:

- `personal-ops status`
- `personal-ops console`
- the console-backed desktop shell
- top assistant action payloads
- existing Drafts and Approvals sections
- existing `workspace_home` summary

The phase does not change:

- review lifecycle transitions
- approval lifecycle transitions
- grouped outbound state transitions
- worklist ordering
- repair-first precedence
- maintenance ownership
- any user-facing command surface

## Guardrail proof

Phase 32 does not add:

- new persistence
- new HTTP routes
- new MCP tools
- new browser mutation paths
- new user-facing commands
- new trust-boundary exceptions

This is a read-model, wording, and operator-path clarity phase only.

## Next step

The intended next assistant-led target after this phase is:

- **Assistant-Led Phase 33: Review Outcome Calibration**

Phase 33 should use actual review, approval, and send follow-through evidence to decide whether more batching, tuning, or decision-surface adjustments are justified.
