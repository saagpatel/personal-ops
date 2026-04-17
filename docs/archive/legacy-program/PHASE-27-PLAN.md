# Phase 27 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Make the human-readable governance surfaces easier to scan and easier to explain while keeping the supported machine-readable contracts and trust boundaries unchanged.

## Starting Point

Phase 26 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the supported detailed operator governance surface
- `status` carrying only:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- one-at-a-time policy pressure in `worklist`
- assistant-safe audit as a fixed categorized feed

## Scope

Phase 27 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no public contract removals
- simpler human-readable `recommendation policy` wording with the same supported sections and ordering
- unchanged compact policy signaling in `status`
- unchanged one-at-a-time policy pressure in `worklist`
- clearer documentation of the supported governance surface map

## Supported Surface Baseline

Phase 27 keeps these roles as the supported baseline:

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
- no lifecycle mutation from readability cleanup

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- human-readable `recommendation policy` keeps the supported section order
- grouped history remains the higher-level history view and raw governance events remain the drill-down layer
- human-readable `status` still shows one primary `Policy attention` line
- `recommendation policy`, `status`, and `worklist` stay aligned on one policy-attention choice
- assistant-safe audit behavior remains unchanged from Phase 26
- operator audit remains raw

## Documentation Closeout

Phase 27 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-27-PLAN.md`
- `docs/PHASE-27-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 27 lands cleanly, the next sensible phase is:

- Phase 28: usage-evidence review for governance surfaces
