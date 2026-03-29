# Phase 9 Plan: Planning Operations and Recommendation Quality Hardening

Date: 2026-03-24
Status: Implemented and live

## Objective

Phase 9 improves the live Phase 8 planning layer without changing the trust model.

The goal is not to add a new write path. The goal is to make planning recommendations:

- calmer
- more explainable
- easier for the operator to triage
- safer to roll out on the shared machine-level control plane

## Guardrails

These constraints remained unchanged through implementation:

- assistants are clients of `personal-ops`, not owners of provider logic
- direct assistant calendar mutation stays out of scope
- automatic recommendation application stays out of scope
- grouped planning reads remain non-mutating
- send stays operator-gated
- calendar mutation stays operator-only

## Delivered Scope

### 1. Schema and data model

Schema advanced from `9` to `10`.

`planning_recommendations` now persists:

- `rank_score`
- `rank_reason`
- `ranking_version`
- `group_key`
- `group_summary`
- `source_last_seen_at`
- `slot_reason`
- `trigger_signals_json`
- `suppressed_signals_json`
- `replan_count`
- `last_replanned_at`
- `decision_reason_code`

Migration stayed additive and column-first. Index creation remains guarded behind column existence checks.

### 2. Recommendation ranking and grouping

Refresh remains service-owned and non-read-triggered.

Phase 9 adds deterministic ranking with:

- recommendation kind bias
- priority bias
- reason-code bias
- time-to-slot weighting
- source freshness weighting
- same-group pressure penalty

Phase 9 also adds grouped planning summaries for:

- `urgent_unscheduled_tasks`
- `urgent_inbox_followups`
- `near_term_meeting_prep`

### 3. Explanation and provenance

Recommendation detail now includes:

- ranking reason
- slot reason
- trigger signals
- suppressed signals
- source freshness
- replan metadata
- decision reason metadata

### 4. Operator workflow polish

New operator-only behavior:

- `recommendation replan`
- snooze presets:
  - `end-of-day`
  - `tomorrow-morning`
  - `next-business-day`
- reject reason codes:
  - `not_useful`
  - `wrong_priority`
  - `bad_timing`
  - `duplicate`
  - `handled_elsewhere`

### 5. Read surface improvements

Updated read surfaces:

- `status`
- `worklist`
- `recommendation list`
- `recommendation show`
- grouped HTTP recommendation reads
- richer MCP planning recommendation reads

### 6. Reliability hardening

Phase 9 adds:

- daemon startup schema preflight
- explicit schema compatibility reporting
- safer migration checks
- rollout verification that includes restart and live planning reads

## Implementation Notes

Main implementation areas:

- `app/src/db.ts`
- `app/src/service.ts`
- `app/src/http.ts`
- `app/src/cli.ts`
- `app/src/formatters.ts`
- `app/src/types.ts`
- `app/src/daemon.ts`
- `app/src/mcp-server.ts`

## Verification Scope

Phase 9 verification includes:

- schema migration from `9` to `10`
- schema compatibility coverage for all new planning columns
- deterministic ranking and grouped planning summaries
- `replan` success and no-op prevention
- snooze presets and reject reason persistence
- startup preflight failure behavior
- HTTP grouped read coverage
- operator-only replan enforcement at the HTTP boundary
- live daemon restart
- live doctor, status, worklist, and recommendation verification
- one real operator replan on the live machine

## Completion Criteria

Phase 9 is considered complete because all of the following are true:

- schema `10` is live
- `npm test` passes
- daemon restart succeeds on the existing machine database
- `doctor --deep --json` is healthy
- grouped planning summaries appear in live worklist and status
- recommendation detail is explainable
- `replan` works live
- operator-only boundaries still hold
- docs and audit files are updated

## Out of Scope That Stayed Out of Scope

- direct assistant calendar writes
- automatic recommendation application
- guest invites
- Meet link management
- recurring scheduling
- focus time / out-of-office / working-location writes
- direct Gmail or Calendar fallback outside `personal-ops`
- sync architecture redesign
