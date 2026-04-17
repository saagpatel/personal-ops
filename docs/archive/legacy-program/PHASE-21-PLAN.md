# Phase 21 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Clean up the one clearly deprecated operator-only policy-report alias while keeping the shared control plane stable, trust-boundary safe, and easier to understand.

## Starting Point

Phase 20 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- explicit assistant-safe audit categories
- operator-only `recommendation policy` as the primary detailed governance surface
- simplified compact policy attention in `status` and `worklist`
- `policy_history_recent_events` as the preferred raw-governance field
- deprecated `policy_history` still present as a temporary compatibility alias

Known follow-up targets at kickoff:

- the raw-governance field still had two names in the operator policy report
- the compatibility alias now created more confusion than safety inside first-party code and docs
- the remaining deprecated compact status fields were still intentionally being held for one more phase

## Scope

Phase 21 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no new mutation surfaces
- removal of the deprecated operator-only `policy_history` alias
- retention of `policy_history_recent_events` as the sole raw-governance drill-down field
- no change to assistant-safe audit scope or filtering
- no change to compact policy status/worklist semantics beyond documentation cleanup

## Contract Cleanup

Phase 21 removes:

- `policy_history` from `PlanningRecommendationPolicyReport`

Phase 21 keeps:

- `policy_history_recent_events` as the only raw-governance field
- `policy_attention_kind`
- `policy_attention_summary`
- `policy_attention_command`
- the existing grouped-history sections
- the existing one-at-a-time policy item behavior in `worklist`

Compatibility posture:

- this is the only operator-facing contract removal in Phase 21
- deprecated compact status fields remain for one more phase:
  - `top_policy_recent_exit_summary`
  - `top_policy_retention_candidate_summary`

## Non-Goals

- no assistant-safe audit filters
- no assistant-safe policy-governance surface
- no schema change
- no ranking change
- no archive/supersede/prune semantic change
- no lifecycle mutation from cleanup
- no automatic suppression, hiding, or execution

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- `policy_history` removed from the shared policy-report type and payload
- `policy_history_recent_events` still contains raw governance history
- grouped-history behavior remains unchanged
- primary policy-attention behavior remains unchanged
- deprecated compact status fields remain populated
- worklist still emits at most one policy item
- assistant-safe audit output remains unchanged from Phase 20
- operator audit output remains raw

Live:

- rebuild the daemon bundle
- create a pre-rollout snapshot
- restart the LaunchAgent
- verify:
  - `status`
  - `doctor --deep`
  - `recommendation policy --json`
  - human-readable `recommendation policy`
  - `worklist`
  - assistant-safe audit HTTP output
  - operator audit HTTP output

## Documentation Closeout

Phase 21 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-21-PLAN.md`
- `docs/PHASE-21-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 21 lands cleanly, the next sensible phase is:

- Phase 22: final compatibility retirement and audit feed review
