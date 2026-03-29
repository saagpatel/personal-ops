# Phase 29 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Keep the supported governance surface frozen and remove only the remaining empty cue noise from human-readable `recommendation policy`.

## Starting Point

Phase 28 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the supported detailed operator governance surface
- `status` as the compact primary attention surface
- one-at-a-time policy pressure in `worklist`
- assistant-safe audit as a fixed categorized feed
- one remaining readability issue in human-readable policy output: a top cue block that still printed many `none` rows

## Scope

Phase 29 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no public contract removals
- no mutation-surface change
- formatter-only suppression of empty cue rows in human-readable `recommendation policy`
- unchanged `status`, `worklist`, and assistant-safe audit behavior
- refreshed documentation and full re-verification after the cleanup

## Supported Surface Baseline

Phase 29 keeps these roles unchanged:

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
- no lifecycle mutation from formatter or documentation cleanup

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- human-readable `recommendation policy` still keeps the supported section order
- meaningful cue rows still render when present
- empty cue rows are omitted when their fallback value would otherwise be `none`
- the entire cue block disappears when every cue value is empty
- `recommendation policy`, `status`, and `worklist` stay aligned on one primary policy-attention state
- assistant-safe audit behavior remains unchanged from Phase 28
- operator audit remains raw

## Documentation Closeout

Phase 29 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-29-PLAN.md`
- `docs/PHASE-29-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 29 lands cleanly, the next sensible phase is:

- Phase 30: long-term governance surface stability review
