# Phase 25 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Retire the last compact policy count fields from `status` while keeping `recommendation policy` as the only detailed governance surface and leaving trust boundaries unchanged.

## Starting Point

Phase 24 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the supported detailed governance surface
- `status` carrying:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- one-at-a-time policy pressure in `worklist`
- assistant-safe audit as a fixed categorized feed

## Scope

Phase 25 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- removal of `policy_recent_exit_count` and `policy_retention_candidate_count` from the status JSON contract
- no change to `recommendation policy`, `worklist`, or assistant-safe audit scope
- clearer documentation that `status` is now only the compact attention surface and `recommendation policy` is the detailed governance surface

## Supported Surface Baseline

Phase 25 keeps these roles as the supported baseline:

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact health and primary attention surface
- `worklist`: one-at-a-time attention prompt
- assistant-safe audit: fixed categorized operational context feed
- hygiene and tuning: assistant-safe explanatory planning reads

## Non-Goals

- no assistant-safe audit filters
- no assistant-safe audit visibility change
- no policy archive/supersede/prune semantic change
- no policy report field removals
- no schema change
- no ranking change
- no lifecycle mutation from compact status cleanup

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- `status` no longer returns `policy_recent_exit_count` or `policy_retention_candidate_count`
- `policy_attention_kind` and `top_policy_attention_summary` remain present
- human-readable `status` still shows one primary `Policy attention` line
- `recommendation policy` remains unchanged in contract and meaning
- `worklist` still emits at most one policy item
- assistant-safe audit behavior remains unchanged from Phase 24
- operator audit remains raw

## Documentation Closeout

Phase 25 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-25-PLAN.md`
- `docs/PHASE-25-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 25 lands cleanly, the next sensible phase is:

- Phase 26: long-term supported surface review
