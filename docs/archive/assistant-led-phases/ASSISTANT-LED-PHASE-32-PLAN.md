# Assistant-Led Phase 32 Plan

Date: 2026-04-13
Status: In Progress

## Goal

Make prepared review, approval, and send work feel like one guided operator flow instead of several neighboring surfaces that describe the same handoff differently.

## Starting Point

Phase 31 already made the workspace calmer by deduplicating low-value surfaced cues.

The next friction seam is narrower:

- review items
- approval requests
- grouped outbound approval/send handoff
- workspace focus and assistant guidance around that same work

The underlying capability is already present. The operator friction is in how the same handoff is described across Drafts, Approvals, grouped outbound, and overview surfaces.

## Scope

Phase 32 delivers:

- one shared derived `ReviewApprovalFlowSummary` read model
- additive status and workspace-home support for the current prepared review/approval/send handoff
- grouped outbound treated as the primary forward path when grouped context exists
- more recovery-oriented and inspection-oriented approval detail when grouped context exists
- less repeated lifecycle copy across overview, Drafts, outbound group cards, and approval detail
- desktop parity through the same console-backed wording

Phase 32 does **not** deliver:

- no new HTTP or MCP routes
- no new persistence
- no new commands
- no browser authority expansion
- no lifecycle changes for review, approval, or grouped outbound state transitions
- no worklist ordering changes
- no `compareAttentionItems()` change
- no broader review-package or tuning unification

## Implementation Shape

### Shared read model

Add:

- `ReviewApprovalFlowState`
- `ReviewApprovalFlowSummary`

Thread it additively through:

- `ServiceStatusReport`
- `WorkspaceHomeSummary`
- top assistant action payloads
- console/bootstrap payloads that already carry status, drafts, approvals, and outbound groups

### Derived handoff logic

Derive one primary operator handoff from existing prepared work using this precedence:

1. `recovery_needed`
   - send-failed approvals
   - blocked grouped outbound handoffs
2. `review_needed`
   - pending/opened review items
   - grouped outbound work in `review_pending`
3. `approval_needed`
   - pending approvals
   - grouped outbound work in `approval_ready` or `approval_pending`
4. `send_ready`
   - grouped outbound work in `send_ready`
   - singleton approved-send work only when no grouped path is stronger
5. `caught_up`

Identity must stay bounded to existing records only:

- `review_item`
- `approval_request`
- `outbound_group`
- `draft_artifact` only when it is the stable anchor behind the chosen handoff

### Surface cleanup

Use the shared handoff summary to:

- add one compact review/approval handoff line to `status`
- let `workspace_home` sound like one operator path when the focus is already review/approval/send work
- make top assistant guidance referential instead of competing when it points at the same handoff
- make grouped outbound the obvious primary path in Drafts and Outbound Finish-Work
- make Approvals more clearly recovery and inspection oriented when the approval belongs to a grouped handoff
- keep review packages and tuning proposals visible but secondary

## Verification Plan

Required gates:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Direct coverage should include:

- `recovery_needed`, `review_needed`, `approval_needed`, `send_ready`, and `caught_up`
- grouped outbound context making approval detail referential/recovery-oriented
- workspace focus, assistant top action, Drafts, and Approvals agreeing on the same primary handoff when they point at the same work
- reduced repeated lifecycle copy across overview, Drafts, outbound group cards, and approval detail
- review packages and tuning staying visible but secondary
- unchanged review/approval/grouped-outbound lifecycle transitions
- unchanged worklist ordering and trust boundaries

## Closeout Contract

Before Phase 32 is called complete:

- update `docs/ASSISTANT-LED-PHASE-32-ROLLOUT.md`
- update the roadmap again so Phase 32 is marked complete and the next target is named
- verify every planned Phase 32 item is complete
- confirm no unrelated dirty changes remain
- complete branch, PR, merge, post-merge CI wait, local `main` sync, and branch cleanup

## Default Next Target

If Phase 32 lands cleanly, the next sensible target is:

- Assistant-Led Phase 33: Review Outcome Calibration
