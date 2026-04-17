# Phase 15 Plan

Date: 2026-03-24
Status: Implemented

## Goal

Add explicit, operator-only, non-enforcing hygiene policy proposal records plus reviewed-family follow-through reporting so operators can track what was reviewed, what now needs follow-through, and what has already been proposed or dismissed without changing recommendation ranking, visibility, lifecycle state, or assistant mutation scope.

## Starting Point

Phase 14 was already live on the shared machine with:

- schema `12`
- ranking version `phase12-v1`
- audit-derived hygiene review state
- operator-only hygiene review mutation
- assistant-safe `review_needed_only` hygiene reads
- review-needed visibility in `status`, `recommendation summary`, and item-based `worklist` shaping

Known baseline debt at kickoff:

- `npm run typecheck` was green
- `npm test` had drifted from the earlier recorded `61/61` state and needed to be re-baselined before rollout

## Scope

Phase 15 delivers:

- additive schema upgrade to `13`
- durable `planning_hygiene_policy_proposals` rows keyed by `group_key + kind + source`
- operator-only proposal record and dismiss mutation across CLI and HTTP
- derived follow-through states for reviewed hygiene families
- new operator-facing `recommendation tuning` report across CLI, HTTP, and MCP
- richer status and summary shaping for reviewed-versus-proposal follow-through

## Durable Model

New table: `planning_hygiene_policy_proposals`

Stored fields:

- `proposal_id`
- `group_key`
- `kind`
- `source`
- `proposal_type`
- `status`
- `basis_signal_updated_at`
- `created_at`
- `created_by_client`
- `created_by_actor`
- `updated_at`
- `updated_by_client`
- `updated_by_actor`
- `note`

Rules:

- one row per family key
- unique constraint on `(group_key, kind, source)`
- additive only; no existing recommendation lifecycle field is repurposed

## Follow-Through States

Phase 15 keeps Phase 14 `review_needed` logic intact, then adds mutually exclusive follow-through visibility:

- `review_needed`
- `reviewed_fresh`
- `reviewed_stale`
- `proposal_open`
- `proposal_stale`
- `proposal_dismissed`

Precedence:

1. `review_needed`
2. `proposal_stale`
3. `proposal_open`
4. `reviewed_stale`
5. `reviewed_fresh`
6. `proposal_dismissed`

Stale threshold:

- fixed at `7 days`

## Mutation Surfaces

Operator-only CLI:

- `personal-ops recommendation hygiene proposal record --group <group> --kind <kind> --source <source> [--note "..."]`
- `personal-ops recommendation hygiene proposal dismiss --group <group> --kind <kind> --source <source> [--note "..."]`

Operator-only HTTP:

- `POST /v1/planning-recommendations/hygiene/proposals/record`
- `POST /v1/planning-recommendations/hygiene/proposals/dismiss`

Audit events:

- `planning_recommendation_hygiene_proposal_recorded`
- `planning_recommendation_hygiene_proposal_dismissed`

Guardrails:

- only current hygiene-candidate families may be mutated
- the family must already have a current operator review
- proposal type is derived from the current candidate action
- proposal mutation must not change recommendation rows, ranking, visibility, refresh behavior, or lifecycle state

## Read Surfaces

Phase 15 extends hygiene family reads with:

- `follow_through_state`
- `proposal_type`
- `proposal_status`
- `proposal_created_at`
- `proposal_updated_at`
- `proposal_note`
- `proposal_by_client`
- `proposal_by_actor`
- `proposal_stale`
- `review_age_days`
- `proposal_age_days`

New report:

- `personal-ops recommendation tuning`
- `GET /v1/planning-recommendations/tuning`
- `planning_recommendation_tuning`

Tuning report fields:

- `review_needed_count`
- `reviewed_fresh_count`
- `reviewed_stale_count`
- `proposal_open_count`
- `proposal_stale_count`
- `proposal_dismissed_count`
- `top_review_needed_summary`
- `top_reviewed_stale_summary`
- `top_proposal_open_summary`
- `top_proposal_stale_summary`

## Non-Goals

- no automatic suppression
- no automatic hiding
- no ranking-version bump
- no recommendation lifecycle mutation from proposal state
- no assistant proposal mutation
- no grouped planning mutation changes
- no provider fallback outside `personal-ops`

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- direct migration coverage for schema `12 -> 13`
- service and transport coverage for proposal record/dismiss and follow-through derivation

Live:

- pre-rollout snapshot
- rebuild the daemon bundle
- restart the LaunchAgent
- verify `status`, `doctor --deep`, `worklist`, `recommendation summary`, `recommendation tuning`, `recommendation hygiene`, `recommendation next`, and grouped recommendation reads
- perform one low-risk live operator loop on a temporary task-backed candidate family
- clean up the temporary task and confirm steady state

## Documentation Closeout

Phase 15 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-15-PLAN.md`
- `docs/PHASE-15-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`
