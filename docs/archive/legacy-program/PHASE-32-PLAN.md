# Phase 32 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Confirm that the Phase 31 single-category audit filter is sufficient in real usage across both HTTP and MCP read surfaces, and update documentation/examples where that review shows a real clarity gap.

## Starting Point

Phase 31 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- unchanged `recommendation policy`, `status`, and `worklist`
- assistant-safe audit default behavior unchanged
- an additive optional audit `category` filter for:
  - `sync`
  - `task`
  - `task_suggestion`
  - `planning`

## Scope

Phase 32 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no public contract removals
- no mutation-surface change
- fresh live review across CLI, HTTP, and MCP audit reads
- documentation/example cleanup only
- no code-path change because the live review did not justify a broader audit query surface

## Supported Surface Baseline

Phase 32 keeps these roles unchanged:

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact health and primary attention surface
- `worklist`: one-at-a-time attention prompt
- assistant-safe audit: categorized operational context feed with an optional single-category filter
- hygiene and tuning: assistant-safe explanatory planning reads

## Non-Goals

- no new audit categories
- no multi-category filtering
- no text-search or date-range audit filters
- no widening of assistant-visible audit families
- no operator raw-audit reshaping
- no `recommendation policy`, `status`, or `worklist` contract change

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Live review must explicitly answer:

- whether the default assistant-safe feed remains useful as a general recent-activity view
- whether filtered planning and task reads remove the sync-noise pain point
- whether `task_suggestion` filtering remains coherent when the slice is small
- whether HTTP and MCP now feel aligned enough that no further audit query surface is justified

## Documentation Closeout

Phase 32 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-32-PLAN.md`
- `docs/PHASE-32-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 32 lands cleanly, the next sensible phase is:

- Phase 33: audit follow-through only if fresh usage evidence shows that single-category filtering is still insufficient
