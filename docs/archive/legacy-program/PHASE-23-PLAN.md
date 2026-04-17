# Phase 23 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Consolidate the current governance surfaces so the detailed operator report, compact status summary, and worklist attention item stay aligned without changing the public contract or widening assistant scope.

## Starting Point

Phase 22 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the primary detailed governance surface
- compact policy attention in `status`
- one-at-a-time policy pressure in `worklist`
- assistant-safe audit as a fixed categorized feed

## Scope

Phase 23 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no public contract removals
- no new mutation surfaces
- one shared internal policy-attention decision path for `recommendation policy`, `status`, and `worklist`
- clearer docs describing the supported governance surface map

## Supported Surface Baseline

Phase 23 confirms these roles as the supported baseline:

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact health and top-attention summary
- `worklist`: single-item attention prompt
- assistant-safe audit: fixed categorized operational context feed
- hygiene and tuning: assistant-safe explanatory planning reads

## Non-Goals

- no assistant-safe audit filters
- no assistant-safe audit visibility change
- no policy archive/supersede/prune semantic change
- no status field removals
- no policy report field removals
- no schema change
- no ranking change
- no lifecycle mutation from consolidation

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- `recommendation policy`, `status`, and `worklist` stay aligned for:
  - `recent_exit`
  - `history_churn`
  - `retention_candidate`
  - `none`
- compact policy counts stay present and match the policy-report totals they summarize
- `worklist` still emits at most one policy item
- assistant-safe audit behavior remains unchanged from Phase 22
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

Phase 23 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-23-PLAN.md`
- `docs/PHASE-23-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 23 lands cleanly, the next sensible phase is:

- Phase 24: supported surface baseline and usage-driven reduction review
