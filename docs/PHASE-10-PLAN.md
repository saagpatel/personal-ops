# Phase 10 Plan: Operator Execution Loops and Planning Throughput

Date: 2026-03-24
Status: Implemented and live

## Objective

Phase 10 turns the Phase 9 planning layer into a better operator execution surface.

The goal is not to widen assistant mutation rights. The goal is to make live planning recommendations:

- easier to act on from grouped views
- more honest about slot contention
- clearer about what happened after operator action
- safer to roll out on the shared machine-level control plane

## Guardrails

These constraints remained unchanged through implementation:

- assistants are clients of `personal-ops`, not owners of provider logic
- direct assistant calendar mutation stays out of scope
- grouped planning reads remain non-mutating
- recommendation `apply` and `replan` remain single-item operator actions
- grouped planning mutations stay operator-only
- send stays operator-gated
- calendar mutation stays operator-only

## Delivered Scope

### 1. Schema and data model

Schema advanced from `10` to `11`.

`planning_recommendations` now persists:

- `outcome_state`
- `outcome_recorded_at`
- `outcome_source`
- `outcome_summary`
- `slot_state`
- `slot_state_reason`

Migration stayed additive and column-first.

### 2. Recommendation closure tracking

Phase 10 adds explicit recommendation outcomes:

- `scheduled`
- `completed`
- `canceled`
- `dismissed`
- `handled_elsewhere`
- `source_resolved`

Outcome updates now happen when:

- a recommendation is applied
- a linked task is completed
- a linked task is canceled
- a recommendation is rejected
- a source no longer needs action after refresh

### 3. Collision-aware slot planning

Recommendation refresh now reserves group-local windows in memory while generating candidates.

That means:

- same-group recommendations no longer silently claim the same slot
- later items can fall back to `needs_manual_scheduling`
- slot contention is visible instead of hidden

### 4. Group-to-action operator loop

Phase 10 adds:

- grouped recommendation detail
- next actionable recommendation reads
- next actionable recommendation reads within a group

Grouped detail includes:

- counts by status
- counts by outcome state
- counts by slot state
- top recommendation
- next actionable recommendation
- oldest unresolved recommendation
- whether manual scheduling is present inside the group

### 5. Low-risk grouped actions

New operator-only grouped actions:

- grouped `snooze`
- grouped `reject`

Grouped reject remains intentionally narrow:

- `duplicate`
- `handled_elsewhere`

No grouped `apply` or grouped `replan` was added.

### 6. Worklist and status shaping

Phase 10 keeps grouped planning visible while reducing crowd-out.

Changes:

- group item remains visible in the main worklist
- raw same-group planning items are capped in the top-level worklist
- status now reports outcome counts and manual-scheduling counts
- top planning summaries now expose next-action and blocked-group context

## Implementation Areas

Main implementation areas:

- `app/src/db.ts`
- `app/src/service.ts`
- `app/src/http.ts`
- `app/src/cli.ts`
- `app/src/mcp-server.ts`
- `app/src/formatters.ts`
- `app/src/types.ts`

## Verification Scope

Phase 10 verification includes:

- schema `10` to `11` migration
- schema compatibility coverage for Phase 10 planning columns
- recommendation outcome propagation after task completion and cancellation
- collision-aware grouped planning generation
- grouped detail and next-action reads
- grouped operator snooze and reject flows
- assistant rejection of grouped operator mutations at the HTTP boundary
- live daemon restart
- live doctor, status, worklist, group detail, and next-action verification
- one real grouped operator snooze on non-critical live data followed by cleanup

## Completion Criteria

Phase 10 is considered complete because all of the following are true:

- schema `11` is live
- `npm test` passes
- daemon restart succeeds on the existing machine database
- `doctor --deep --json` is healthy
- grouped planning detail and next-action reads work live
- recommendation detail shows outcome and slot-state context
- grouped operator snooze works live
- operator-only boundaries still hold
- docs and audit files are updated

## Out of Scope That Stayed Out of Scope

- direct assistant calendar writes
- automatic recommendation application
- grouped apply
- grouped replan
- guest invites
- Meet link management
- recurring scheduling
- direct Gmail or Calendar fallback outside `personal-ops`
