# Assistant-Led Phase 11 Plan

## Title

Review Trends, Tuning Impact, and Weekly Operator Review

## Goal

Turn Phase 10's rolling review reporting into a decision-ready operator system that shows:

- whether review load is improving over time
- which approved tuning changes actually helped
- which surfaces still need operator attention this week
- where low-value review work is still clustering

## Scope

Phase 11 adds:

- persisted daily review metric snapshots for global and per-surface trend history
- `personal-ops review trends`
- `personal-ops review impact`
- `personal-ops review weekly`
- `GET /v1/review/trends`
- `GET /v1/review/impact`
- `GET /v1/review/weekly`
- a dedicated console Review Trends surface
- additive compact status deltas for week-over-week review movement

## Guardrails

- review intelligence stays a derived overlay
- no automatic tuning approval
- no automatic rollback
- no new core workflow ranking source
- no widened browser mutation authority
- desktop remains summary-only

## Core Design

### Snapshot history

- persist one daily snapshot row per scope
- scopes:
  - `global`
  - `inbox`
  - `meetings`
  - `planning`
  - `outbound`
- snapshot metrics are derived from review package cycles, feedback, approved tuning, and notification telemetry
- snapshot generation is idempotent per day and scope

### Tuning impact

- compare approved tuning over a fixed pre/post window
- scope comparisons by proposal family:
  - `source_suppression`: same surface and source key
  - `surface_priority_offset`: same surface
  - `notification_cooldown_override`: same surface
- if evidence is too thin, report `insufficient_data` instead of guessing

### Weekly operator review

- summarize week-over-week deltas
- highlight top noisy sources
- show recent tuning impact
- emit additive operator recommendations only

## Acceptance

Phase 11 is complete when:

- trend snapshots persist and backfill correctly
- trend and weekly reports compute stable week-over-week deltas
- approved tuning impact comparisons show pre/post movement or explicit insufficient evidence
- CLI, HTTP, console, and status all consume the same reporting model
- no review reporting change alters raw worklist ranking or core workflow behavior
