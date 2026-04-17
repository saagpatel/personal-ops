# Phase 19 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Refine the operator-only `recommendation policy` surface so long-horizon governance history is easier to read and prune intentionally by adding derived grouped-history summaries without changing any stored policy state.

## Starting Point

Phase 18 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- assistant-safe least-privilege audit shaping
- operator-only policy-governance prune controls
- cross-horizon `recommendation policy` reporting for active backlog, recent exits, raw policy history, and retention candidates

Known follow-up targets at kickoff:

- long-horizon policy history was still event-by-event and noisy for repeated families
- `recommendation policy` showed raw history, but it did not summarize repeated governance churn or mixed archive/supersede outcomes by family
- compact operator surfaces still needed better governance wording without adding new counters or widening assistant visibility

## Scope

Phase 19 delivers:

- no schema bump beyond `14`
- no new mutation surfaces
- derived grouped-history summaries inside `recommendation policy`
- explicit grouped-family churn and retention guidance for operator-only policy reads
- raw governance-event drill-down retained alongside the new grouped-family view
- compact wording improvements in existing policy-related worklist/status summaries

## Derived-Only Compression Model

Phase 19 does not add durable compression state.

It keeps:

- `planning_hygiene_policy_governance_events` as the append-only raw governance ledger
- `planning_hygiene_policy_proposals` as the active-family proposal posture record

Compression happens at read time only:

- no new tables
- no backfill
- no row rewriting
- no merged summary storage
- no auto-prune and no implicit retention cleanup

## Read-Surface Changes

### `recommendation policy`

The operator-only policy report now adds:

- grouped policy-history family summaries
- repeated-family counts
- mixed-outcome-family counts
- top repeated-family and mixed-outcome summaries
- a governance-hygiene watchlist derived from grouped families
- `policy_history_recent_events` as the primary raw-governance drill-down field

For one compatibility phase, raw events also remain available through:

- `policy_history`

### Grouped history families

Each grouped-family row now includes:

- archive/supersede counts
- recent 30-day and 90-day governance activity
- mixed-outcome detection
- derived operator guidance:
  - `monitor`
  - `prune_old_history`
  - `review_policy_churn`
- note-free grouped summaries
- raw governance event ids for drill-down

### Status and worklist

Phase 19 keeps compact policy counters unchanged.

Allowed improvements:

- policy retention summaries may now prefer grouped-family wording when that is more helpful
- the existing `planning_policy_governance_needed` worklist item may now point to repeated policy churn when there is no better recent-exit summary

No new counters or worklist kinds are introduced.

## Non-Goals

- no assistant-safe audit changes
- no assistant-safe policy-history expansion
- no ranking-version change
- no lifecycle mutation from grouped-history reporting
- no automatic suppression or hiding
- no automatic retention cleanup
- no new operator mutation commands

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- grouped-family derivation from multiple governance events
- repeated-family counts
- mixed archive/supersede detection
- grouped-family recommended-action derivation
- grouped-history ordering
- raw governance-event drill-down remaining intact
- note-free grouped summaries
- unchanged archive/supersede/prune behavior
- unchanged assistant-safe audit behavior
- compact status/worklist wording remaining note-free

Live:

- rebuild the daemon bundle
- create a pre-rollout snapshot
- restart the LaunchAgent
- verify:
  - `status`
  - `doctor --deep`
  - `recommendation policy --json`
  - human-readable `recommendation policy`
  - `worklist`

## Documentation Closeout

Phase 19 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-19-PLAN.md`
- `docs/PHASE-19-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 19 lands cleanly, the next sensible phase is:

- Phase 20: assistant audit policy review and operator signal simplification
