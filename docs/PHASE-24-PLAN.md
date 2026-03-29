# Phase 24 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Keep the current governance surface stable while reducing duplication in human-readable `status` output and making the supported surface roles easier to understand.

## Starting Point

Phase 23 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the supported detailed governance surface
- compact policy counts and primary attention in `status`
- one-at-a-time policy pressure in `worklist`
- assistant-safe audit as a fixed categorized feed

## Scope

Phase 24 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no public contract removals
- no new mutation surfaces
- quieter human-readable `status` output while keeping the JSON shape unchanged
- clearer documentation describing the supported governance surface map

## Supported Surface Baseline

Phase 24 keeps these roles as the supported baseline:

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact summary surface with one primary human-readable policy-attention line
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
- no lifecycle mutation from formatter cleanup

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- human-readable `status` still shows one primary `Policy attention` line
- compact policy counts remain present in JSON and appear lower in the formatted status block
- `recommendation policy` remains unchanged in contract and detailed meaning
- `worklist` still emits at most one policy item
- assistant-safe audit behavior remains unchanged from Phase 23
- operator audit remains raw

Live:

- rebuild the daemon bundle
- create a pre-rollout snapshot
- restart the LaunchAgent
- verify:
  - `status --json`
  - human-readable `status`
  - `doctor --deep`
  - `recommendation policy --json`
  - human-readable `recommendation policy`
  - `worklist`
  - assistant-safe audit HTTP output
  - operator audit HTTP output

## Documentation Closeout

Phase 24 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-24-PLAN.md`
- `docs/PHASE-24-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 24 lands cleanly, the next sensible phase is:

- Phase 25: evidence-based compact signal retirement review
