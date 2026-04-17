# Phase 28 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Review the live post-Phase-27 governance surfaces as the supported baseline and make only tiny human-readable cleanups where real usage still shows noise.

## Starting Point

Phase 27 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the supported detailed operator governance surface
- `status` carrying only:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- one-at-a-time policy pressure in `worklist`
- assistant-safe audit as a fixed categorized feed

## Scope

Phase 28 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no public contract removals
- live evidence review across `recommendation policy`, `status`, `worklist`, and assistant-safe audit
- one small formatter cleanup that trims lingering repeated summary labels in human-readable policy output
- clearer documentation of what evidence was reviewed and why the current governance surface remains the supported baseline

## Supported Surface Baseline

Phase 28 keeps these roles as the supported baseline:

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
- no status field removals
- no schema change
- no ranking change
- no lifecycle mutation from evidence review or wording cleanup

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- `recommendation policy`, `status`, and `worklist` stay aligned on one primary policy-attention state
- human-readable `status` still shows one primary `Policy attention` line
- human-readable `recommendation policy` keeps the supported section order while trimming repeated summary wording
- grouped history remains the higher-level history view and raw governance events remain the drill-down layer
- assistant-safe audit behavior remains unchanged from Phase 27
- operator audit remains raw

## Documentation Closeout

Phase 28 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-28-PLAN.md`
- `docs/PHASE-28-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 28 lands cleanly, the next sensible phase is:

- Phase 29: selective governance ergonomics follow-through
