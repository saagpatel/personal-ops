# Phase 11 Plan: Planning Closure Analytics and Throughput Polish

Date: 2026-03-24
Status: Implemented and live

## Objective

Phase 11 turns the Phase 10 planning layer into a clearer reporting and throughput surface without widening mutation scope.

The goal is to make recommendation history easier to understand:

- what got a first operator action
- what actually closed
- why it closed
- which groups are backlogged, stale, or resurfacing
- how quickly recommendations are being handled

## Guardrails

These constraints remained unchanged through implementation:

- `personal-ops` remains the shared machine-level control plane
- assistants are clients of `personal-ops`, not owners of provider logic
- send stays operator-gated
- calendar mutation stays operator-only
- grouped planning reads remain non-mutating
- assistants do not get new planning mutation rights
- no parallel Gmail or Calendar workflow was introduced outside `personal-ops`

## Delivered Scope

### 1. Schema and lifecycle fields

Schema advanced from `11` to `12`.

`planning_recommendations` now persists:

- `first_action_at`
- `first_action_type`
- `closed_at`
- `close_reason_code`
- `closed_by_client`
- `closed_by_actor`

These fields stay on the existing recommendation row instead of creating a second history system.

### 2. Derived analytics read model

Phase 11 adds one shared analytics read model that derives:

- summary metrics
- backlog metrics
- closure metrics

The reports are computed from recommendation rows and lifecycle fields already stored in SQLite.

### 3. Lifecycle bookkeeping

First-action and closure bookkeeping now updates consistently when recommendations are:

- applied
- replanned
- snoozed
- group-snoozed
- rejected
- group-rejected
- closed from linked task completion
- closed from linked task cancellation
- closed because the source resolved
- closed because the recommendation expired

First action is recorded once. Closure is recorded once. Later refresh passes do not overwrite an already-correct closure reason.

### 4. New read-only surfaces

New CLI reads:

- `personal-ops recommendation summary`
- `personal-ops recommendation backlog`
- `personal-ops recommendation backlog --group <group-key>`
- `personal-ops recommendation closure`
- `personal-ops recommendation closure --days <n>`

New HTTP reads:

- `GET /v1/planning-recommendations/summary`
- `GET /v1/planning-recommendations/backlog`
- `GET /v1/planning-recommendations/closure`

New MCP reads:

- `planning_recommendation_summary`
- `planning_recommendation_backlog`
- `planning_recommendation_closure`

All of these remain read-only and assistant-safe.

### 5. Status and grouped-detail shaping

`status` now reports:

- stale pending count
- stale scheduled count
- resurfaced source count
- closed last 7 and 30 days
- completed last 30 days
- handled-elsewhere last 30 days
- median time to first action
- median time to close
- top backlog summary
- top closure summary

Grouped detail now reports:

- stale pending count
- stale scheduled count
- resurfaced source count
- median open age in hours
- completed last 30 days
- handled elsewhere last 30 days

## Verification Scope

Phase 11 verification includes:

- `npm run typecheck`
- `npm test`
- schema `11` to `12` migration coverage
- schema compatibility coverage for Phase 11 planning columns
- lifecycle coverage for first action and closure bookkeeping
- CLI, HTTP, and MCP coverage for new analytics reads
- cross-phase regression across all eleven phases
- live daemon restart on the shared machine
- live doctor, status, worklist, grouped reads, next-action read, and new analytics reads
- one real low-risk operator action followed by cleanup and live analytics confirmation

## Completion Criteria

Phase 11 is considered complete because all of the following are true:

- schema `12` is live
- `npm run typecheck` passes
- `npm test` passes
- daemon restart succeeds on the existing machine database
- `doctor --deep --json` is healthy
- old Phase 10 planning reads still work live
- new summary, backlog, and closure reads work live
- grouped detail shows throughput context live
- analytics update after a real operator action and cleanup
- docs and audit files are updated from the real verified state

## Out of Scope That Stayed Out of Scope

- direct assistant calendar writes
- automatic recommendation application
- grouped apply
- grouped replan
- direct Gmail or Calendar fallback outside `personal-ops`
- guest invite workflows
- Meet link management
- recurring scheduling
