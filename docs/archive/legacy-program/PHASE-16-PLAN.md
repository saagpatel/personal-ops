# Phase 16 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Refine the Phase 15 hygiene-policy loop so operators can triage active reviewed/proposed families more quickly, retain a compact memory of recently closed follow-through, and keep operator-authored proposal metadata out of assistant-safe hygiene reads.

## Starting Point

Phase 15 was already live on the shared machine with:

- schema `13`
- ranking version `phase12-v1`
- explicit operator-only hygiene proposal record and dismiss mutation
- follow-through states on hygiene families
- `recommendation tuning` counts and top summaries across CLI, HTTP, and assistant-safe MCP reads

Known refinement targets at kickoff:

- operator tuning still required dropping into raw hygiene rows for the most useful active triage detail
- proposal follow-through context disappeared once a family left the active queue
- assistant-safe hygiene reads still carried operator-authored proposal note and attribution fields

## Scope

Phase 16 delivers:

- assistant-safe redaction of `proposal_note`, `proposal_by_client`, and `proposal_by_actor`
- richer `recommendation tuning` output with:
  - `attention_families`
  - `recently_closed_families`
- clearer human-readable tuning/status/summary wording around stale versus tracked proposal state
- worklist follow-through shaping that only fires for:
  - `review_needed`
  - `reviewed_stale`
  - `proposal_stale`

## Read-Surface Changes

### Hygiene reads

Operator-authenticated CLI and HTTP still expose:

- `proposal_note`
- `proposal_by_client`
- `proposal_by_actor`

Assistant-safe HTTP and MCP reads now keep those keys present but redact them to `null`.

All non-sensitive follow-through fields stay visible to assistants, including:

- `follow_through_state`
- `proposal_type`
- `proposal_status`
- `proposal_created_at`
- `proposal_updated_at`
- `proposal_stale`
- `review_age_days`
- `proposal_age_days`

### Tuning reads

`recommendation tuning` now includes:

- counts and top summaries from Phase 15
- `attention_families`
- `recently_closed_families`

`attention_families` is active-only and ordered for operator triage:

1. `proposal_stale`
2. `reviewed_stale`
3. `review_needed`
4. `proposal_open`

`recently_closed_families` is operator-focused recent history:

- no active recommendations remain for the family
- review or proposal activity happened within 30 days
- closure activity happened within 30 days

Assistant-safe tuning keeps:

- counts
- top summaries
- safe `attention_families`

Assistant-safe tuning hides operator-only recent history by returning:

- `recently_closed_families: []`

## Worklist Behavior

Phase 16 keeps worklist item-based.

`planning_hygiene_followthrough_needed` now:

- fires for `proposal_stale`
- fires for `reviewed_stale`
- fires for `review_needed`
- does not fire for `proposal_open`
- does not fire for `proposal_dismissed`

The item summary now includes the follow-through state and age context when available.

## Non-Goals

- no schema change beyond Phase 15
- no ranking-version change
- no automatic suppression
- no automatic hiding
- no lifecycle mutation from tuning state
- no new proposal mutation surface
- no assistant mutation expansion
- no provider-side fallback outside `personal-ops`

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- assistant-safe hygiene redaction for proposal note and attribution
- operator hygiene visibility remains intact
- tuning attention ordering
- dismissed families stay out of attention until new evidence reopens review-needed state
- recently closed operator history appears only after active families leave the queue
- assistant-safe tuning keeps `recently_closed_families` empty
- worklist follow-through ignores `proposal_open` and `proposal_dismissed`
- ranking and lifecycle remain unchanged by Phase 16 read shaping

Live:

- pre-rollout snapshot
- rebuild the daemon bundle
- restart the LaunchAgent
- verify `status`, `doctor --deep`, `worklist`, `recommendation summary`, `recommendation tuning`, and `recommendation hygiene`
- perform one low-risk live task-backed hygiene loop
- confirm assistant-safe HTTP reads redact proposal note/attribution
- confirm assistant-safe tuning keeps recent-history empty
- clean up the temporary task and restore steady state

## Documentation Closeout

Phase 16 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-16-PLAN.md`
- `docs/PHASE-16-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 16 lands cleanly, the next sensible phase is:

- Phase 17: policy lifecycle governance without execution
