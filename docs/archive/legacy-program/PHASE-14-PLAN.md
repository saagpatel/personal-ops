# Phase 14 Plan

Date: 2026-03-24
Status: Complete

## Goal

Make advisory planning-hygiene signals operator-reviewable without adding suppression state, widening assistant mutation rights, or changing schema or ranking behavior.

## Scope

Phase 14 stays on schema `12` and remains audit-derived and review-first.

Delivered scope:

- audit-derived hygiene review state keyed by:
  - `group_key`
  - `kind`
  - `source`
- operator-only hygiene review mutation across:
  - CLI
  - HTTP
- assistant-safe hygiene reads now support:
  - `review_needed_only`
- review-needed summaries in:
  - `status`
  - `recommendation summary`
  - `worklist`
- compatibility shaping so existing hygiene summaries continue to work while preferring review-needed candidates
- no ranking-version change; ranking remains `phase12-v1`

## Guardrails

Phase 14 does not:

- add a schema migration
- add a new durable review table
- add suppression rule state
- add automatic suppression or hiding
- mutate recommendation lifecycle state from hygiene review
- widen assistant mutation scope
- introduce direct Gmail or direct Calendar fallback outside `personal-ops`

## Implementation Notes

The implementation keeps hygiene triage inside the existing audit/event model:

- hygiene review state is derived from audit events for `planning_recommendation_family`
- `review_needed` becomes `true` when a candidate family has never been reviewed or when newer signal evidence exists than the last review
- `review_needed_only` is a filter on the existing hygiene read, not a separate report type
- status and worklist now surface review-needed counts without adding any mutating read path
- the operator CLI review command was hardened so nested review flags and `--json` work correctly even though the parent hygiene read command reuses overlapping filter names

## Verification Targets

- `npm run typecheck`
- `npm test`
- live daemon restart on the shared machine
- `personal-ops doctor --deep --json`
- `personal-ops status --json`
- `personal-ops worklist --json`
- `personal-ops recommendation summary --json`
- `personal-ops recommendation hygiene --json`
- `personal-ops recommendation hygiene --review-needed-only --json`
- `personal-ops recommendation hygiene review --group <group> --kind <kind> --source <source> --decision <decision> --json`
- one low-risk live operator hygiene-review loop with cleanup-safe verification

## Documentation Closeout

Phase 14 requires:

- `docs/PHASE-14-PLAN.md`
- `docs/PHASE-14-ROLLOUT.md`
- `README.md`
- `CLIENTS.md`
- `docs/2026-03-24-system-audit.md`
