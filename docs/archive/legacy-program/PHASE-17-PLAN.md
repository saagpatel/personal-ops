# Phase 17 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Extend the Phase 15 and 16 hygiene-policy loop into explicit long-horizon policy governance while closing the remaining planning-specific assistant-safe history leaks.

## Starting Point

Phase 16 was already live on the shared machine with:

- schema `13`
- ranking version `phase12-v1`
- explicit operator-only hygiene proposal record and dismiss mutation
- active `attention_families` plus operator-only `recently_closed_families`
- assistant-safe proposal-metadata redaction on hygiene reads

Known follow-up targets at kickoff:

- `dismissed_for_now` policy posture was still only implicit in active family state
- inactive policy ideas had no explicit long-horizon governance record beyond audit history
- assistant-safe hygiene still exposed operator review note and review attribution
- assistant-safe planning recommendation detail still exposed planning-policy audit history

## Scope

Phase 17 delivers:

- additive schema upgrade to `14`
- explicit append-only policy governance events for:
  - `policy_archived`
  - `policy_superseded`
- operator-only `recommendation policy` reads across CLI and HTTP
- operator-only `recommendation policy archive` and `recommendation policy supersede` mutation across CLI and HTTP
- assistant-safe hygiene redaction for operator review note and review attribution
- assistant-safe planning recommendation detail shaping that removes hygiene/proposal/policy governance audit events

## Policy Governance Model

Current active-family proposal state stays in `planning_hygiene_policy_proposals` and keeps the same `proposed` / `dismissed` statuses.

Phase 17 adds a second durable layer:

- `planning_hygiene_policy_governance_events`

This table is:

- append-only
- operator-authored
- non-enforcing
- history-oriented rather than queue-mutating

It exists to distinguish:

- active `dismissed_for_now`
- inactive `archived`
- inactive `superseded`

without changing recommendation ranking, visibility, or lifecycle state.

## Read-Surface Changes

### Policy report

`recommendation policy` now returns:

- active proposed count
- active dismissed-for-now count
- archived count
- superseded count
- active policy backlog
- policy history

The report is operator-only. Assistant clients do not get a safe MCP or HTTP variant in Phase 17.

### Hygiene reads

Assistant-safe hygiene now keeps review state visible but redacts:

- `last_review_by_client`
- `last_review_by_actor`
- `last_review_note`

`review_summary` stays present but becomes a sanitized timestamp-plus-decision summary for assistant-safe reads.

### Recommendation detail

Assistant-safe recommendation detail now strips planning-policy history from `related_audit_events` while leaving operational recommendation history intact.

## Non-Goals

- no automatic suppression
- no automatic hiding
- no recommendation lifecycle mutation from policy governance
- no ranking-version change
- no widening of assistant mutation scope
- no change to global `audit_events_recent` semantics in this phase

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- schema `13 -> 14` migration
- operator-only policy archive/supersede mutation
- inactive-family-only enforcement for policy governance
- active policy backlog versus policy history separation
- assistant-safe hygiene review-metadata redaction
- assistant-safe recommendation-detail audit redaction
- operator-visible policy history remaining intact
- no ranking or lifecycle drift from governance events

Live:

- verify `status`, `doctor --deep`, `recommendation tuning`, and `recommendation policy`
- verify operator HTTP policy reads succeed
- verify assistant HTTP policy reads fail cleanly
- verify assistant-safe recommendation detail no longer exposes planning-policy audit history

## Documentation Closeout

Phase 17 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-17-PLAN.md`
- `docs/PHASE-17-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 17 lands cleanly, the next sensible phase is:

- Phase 18: assistant-safe audit boundary and history retention review
