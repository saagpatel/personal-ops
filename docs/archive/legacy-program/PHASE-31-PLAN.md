# Phase 31 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Improve assistant-safe audit discoverability by adding a narrow optional category filter to the existing audit read surfaces without widening visibility or changing the default feed.

## Starting Point

Phase 30 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- `recommendation policy` as the detailed operator governance surface
- `status` as the compact primary attention surface
- `worklist` as the one-at-a-time attention surface
- assistant-safe audit as a categorized read surface with a fixed safe event set

Fresh live evidence showed one concrete pain point:

- assistant-safe `GET /v1/audit/events?limit=5` was frequently dominated by `mailbox_sync` and `calendar_sync`
- task and planning context was still safe to expose, but harder to isolate quickly

## Scope

Phase 31 delivers:

- no schema bump beyond `14`
- no ranking-version change beyond `phase12-v1`
- no mutation-surface change
- an additive optional `category` filter on:
  - `GET /v1/audit/events`
  - MCP `audit_events_recent`
- the existing category set only:
  - `sync`
  - `task`
  - `task_suggestion`
  - `planning`
- no change to the default feed when `category` is omitted
- refreshed documentation and full re-verification after rollout

## Supported Surface Baseline

Phase 31 keeps these roles unchanged:

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact health and primary attention surface
- `worklist`: one-at-a-time attention prompt
- assistant-safe audit: categorized operational context feed with an optional single-category filter
- hygiene and tuning: assistant-safe explanatory planning reads

## Non-Goals

- no widening of assistant-visible audit families
- no operator raw-audit reshaping
- no new categories
- no multi-category selection
- no text search or date-range audit filters
- no `recommendation policy`, `status`, or `worklist` contract change
- no archive/supersede/prune semantic change

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- assistant-safe default audit reads remain unchanged when `category` is omitted
- assistant-safe filtered reads return only matching visible events for `sync`, `task`, `task_suggestion`, and `planning`
- operator filtered reads remain raw
- invalid category values fail validation cleanly
- `recommendation policy`, `status`, and `worklist` remain unchanged

## Documentation Closeout

Phase 31 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-31-PLAN.md`
- `docs/PHASE-31-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 31 lands cleanly, the next sensible phase is:

- Phase 32: post-filter audit evidence review
