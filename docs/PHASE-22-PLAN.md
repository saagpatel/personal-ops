# Phase 22 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Finish the current policy/governance compatibility cleanup by retiring the last deprecated compact policy status fields while keeping assistant-safe audit behavior fixed and all trust boundaries unchanged.

## Starting Point

Phase 21 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the primary detailed governance surface
- `policy_history_recent_events` as the only raw-governance field
- one-at-a-time policy item pressure in `worklist`
- assistant-safe audit as a fixed categorized feed
- deprecated compact status compatibility fields still present:
  - `top_policy_recent_exit_summary`
  - `top_policy_retention_candidate_summary`

## Scope

Phase 22 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no new mutation surfaces
- removal of the two remaining deprecated compact policy status fields
- no change to `recommendation policy`
- no change to assistant-safe audit scope, categories, or filtering

## Contract Cleanup

Phase 22 removes from the planning section of `ServiceStatusReport`:

- `top_policy_recent_exit_summary`
- `top_policy_retention_candidate_summary`

Phase 22 keeps:

- `policy_attention_kind`
- `top_policy_attention_summary`
- `policy_recent_exit_count`
- `policy_retention_candidate_count`
- `policy_history_recent_events`
- existing grouped-history policy sections
- existing one-at-a-time policy worklist behavior

## Non-Goals

- no assistant-safe audit filters
- no assistant-safe audit visibility change
- no policy archive/supersede/prune semantic change
- no schema change
- no ranking change
- no lifecycle mutation from cleanup
- no automatic suppression, hiding, or execution

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- deprecated compact status fields removed from status JSON shape
- `policy_attention_kind` and `top_policy_attention_summary` remain present
- human-readable `status` still shows one primary `Policy attention` line
- `recommendation policy` behavior remains unchanged
- `policy_history_recent_events` remains correct
- `worklist` still emits at most one policy item
- assistant-safe audit behavior remains unchanged from Phase 21
- operator audit remains raw

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

Phase 22 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-22-PLAN.md`
- `docs/PHASE-22-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 22 lands cleanly, the next sensible phase is:

- Phase 23: governance surface consolidation review
