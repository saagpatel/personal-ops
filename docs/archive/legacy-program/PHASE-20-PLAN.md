# Phase 20 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Refine assistant-safe audit shaping and operator-facing policy attention so the trust boundary is easier to maintain and compact policy signals stop competing with the detailed `recommendation policy` surface.

## Starting Point

Phase 19 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- assistant-safe least-privilege audit shaping
- operator-only `recommendation policy` with grouped policy-history families
- compact policy counts in `status`
- policy governance and retention item pressure in `worklist`
- `policy_history_recent_events` plus a temporary `policy_history` compatibility alias

Known follow-up targets at kickoff:

- assistant-safe audit shaping still lived in a large action switch and needed a clearer explicit policy
- `recommendation policy` had become the detailed governance surface, but `status` and `worklist` could still emit multiple overlapping policy nudges
- compact policy summaries were still split across separate top lines instead of one primary attention signal

## Scope

Phase 20 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no new mutation surfaces
- explicit assistant-safe audit categories for already-visible safe events
- a primary policy-attention model on `recommendation policy`
- simplified compact policy attention in `status`
- one primary policy worklist item at a time
- one more compatibility phase for deprecated `policy_history`

## Assistant-Safe Audit Policy

Phase 20 keeps the effective assistant-visible audit set substantially unchanged.

It now formalizes that behavior as an explicit policy registry:

- hidden by default for unknown future actions
- hidden for operator-only action families such as approvals, send windows, review queue actions, planning hygiene and policy-governance actions, calendar writes, and prune/admin-style operations
- visible only for the same safe operational families already exposed in Phase 18 and Phase 19:
  - mailbox sync
  - calendar sync
  - task lifecycle
  - task suggestion lifecycle
  - visible planning lifecycle actions

Visible assistant-safe events now include:

- sanitized `metadata_json`
- normalized `summary`
- `metadata_redacted = true`
- `assistant_safe_category`

Categories:

- `sync`
- `task`
- `task_suggestion`
- `planning`

Operator audit reads remain raw and unchanged.

## Policy Attention Model

Phase 20 makes `recommendation policy` the primary detailed governance surface.

The policy report now adds:

- `policy_attention_kind`
- `policy_attention_summary`
- `policy_attention_command`

Priority order:

1. `recent_exit`
2. `history_churn`
3. `retention_candidate`
4. `none`

This same primary attention signal now feeds:

- the top section of `recommendation policy`
- compact planning-policy status output
- one-at-a-time worklist policy pressure

## Compact Surface Changes

### `status`

Phase 20 keeps compatibility counts and deprecated summary fields:

- `policy_recent_exit_count`
- `policy_retention_candidate_count`
- `top_policy_recent_exit_summary`
- `top_policy_retention_candidate_summary`

It adds:

- `policy_attention_kind`
- `top_policy_attention_summary`

Human-readable status now emphasizes one `Policy attention` line instead of multiple equal-weight policy summary lines.

### `worklist`

Phase 20 keeps existing policy item kinds, but emits only one policy item at a time:

1. recent exit
2. history churn
3. retention candidate

No new worklist kind is introduced.

## Compatibility Note

Phase 20 keeps:

- `policy_history_recent_events` as the preferred raw-governance field
- `policy_history` as a deprecated exact alias for one more phase

No backfill or schema change is required.

## Non-Goals

- no widening of assistant-visible audit categories
- no assistant-visible policy-governance surface
- no operator-policy mutation change
- no archive/supersede/prune semantic change
- no ranking-version change
- no lifecycle mutation from read shaping
- no automatic suppression, hiding, or execution

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- assistant-safe audit categories for visible events
- hidden-by-default behavior for unknown audit actions
- unchanged hiding of sensitive/operator-only audit families
- operator audit remaining raw
- policy-attention priority derivation
- primary policy-attention section in the operator formatter
- one-at-a-time policy worklist pressure
- continued equality of `policy_history_recent_events` and deprecated `policy_history`
- unchanged policy-governance mutation semantics

Live:

- rebuild the daemon bundle
- create a pre-rollout snapshot
- restart the LaunchAgent
- verify:
  - assistant-safe audit HTTP output
  - operator audit HTTP output
  - `status`
  - `doctor --deep`
  - `recommendation policy --json`
  - human-readable `recommendation policy`
  - `worklist`

## Documentation Closeout

Phase 20 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-20-PLAN.md`
- `docs/PHASE-20-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 20 lands cleanly, the next sensible phase is:

- Phase 21: compatibility cleanup and governance surface pruning
