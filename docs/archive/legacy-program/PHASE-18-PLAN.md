# Phase 18 Plan

Date: 2026-03-25
Status: Implemented

## Goal

Refine the Phase 17 policy-governance layer by making assistant-visible audit reads least-privilege, adding explicit operator-controlled governance-history retention, and turning `recommendation policy` into a cross-horizon operator summary.

## Starting Point

Phase 17 was already live on the shared machine with:

- schema `14`
- ranking version `phase12-v1`
- explicit operator-only `recommendation policy` archive and supersede mutation
- assistant-safe hygiene redaction for operator review note and attribution
- assistant-safe planning recommendation detail redaction for hygiene, proposal, and policy-governance audit history

Known follow-up targets at kickoff:

- `audit_events_recent` still exposed broad raw audit metadata to assistant-authenticated reads
- long-horizon policy history had no operator-controlled retention workflow
- `recommendation policy` did not connect active backlog, recent exits, long-horizon history, and retention candidates in one view
- `status` and `worklist` did not yet surface compact policy-governance pressure

## Scope

Phase 18 delivers:

- assistant-safe shaping for `GET /v1/audit/events` and MCP `audit_events_recent`
- explicit operator-only `recommendation policy prune` mutation across CLI and HTTP
- no schema change beyond Phase 17 schema `14`
- enriched `recommendation policy` reads with:
  - recent inactive proposal-backed exits
  - governance-history retention candidates
- compact policy-governance counts and summaries in `status`
- item-based policy-governance and policy-retention signals in `worklist`

## Assistant-Safe Audit Boundary

Assistant-authenticated audit reads now:

- omit sensitive/operator-only actions entirely by default
- keep only safe operational events
- return sanitized `metadata_json`
- add:
  - `summary`
  - `metadata_redacted`

Sensitive assistant-hidden families include:

- `approval_*`
- `send_window_*`
- `review_queue_*`
- `planning_recommendation_hygiene_*`
- `planning_recommendation_policy_*`
- calendar-write actions
- prune actions
- snapshot and administrative actions
- unknown future actions

Visible assistant-safe audit categories remain limited to safe operational events such as:

- `mailbox_sync`
- `calendar_sync`
- task lifecycle events
- task suggestion lifecycle events
- planning recommendation lifecycle events that already affect visible queue state

## Policy Retention Model

Phase 18 keeps policy governance explicit and operator-only.

No automatic TTL deletion is introduced.

Instead, Phase 18 adds manual prune controls that operate only on:

- `planning_hygiene_policy_governance_events`

Prune does not delete:

- proposals
- planning recommendations
- audit events
- hygiene review state

Retention-candidate defaults:

- `policy_superseded` becomes a candidate at `30 days`
- `policy_archived` becomes a candidate at `90 days`

## Read-Surface Changes

### `recommendation policy`

The policy report now spans four operator-facing sections:

1. active policy backlog
2. recent policy exits awaiting archive or supersede judgment
3. long-horizon policy history
4. retention candidates plus a suggested prune command

New report fields:

- `recent_policy_exit_count`
- `retention_candidate_count`
- `top_recent_policy_exit_summary`
- `top_retention_candidate_summary`
- `recent_policy_exits`
- `retention_candidates`

### `status`

`status` keeps planning-policy reporting compact and adds:

- `policy_recent_exit_count`
- `policy_retention_candidate_count`
- `top_policy_recent_exit_summary`
- `top_policy_retention_candidate_summary`

### `worklist`

Phase 18 keeps worklist item-based and adds:

- `planning_policy_governance_needed`
- `planning_policy_retention_review_needed`

Suggested command for both remains:

- `personal-ops recommendation policy`

## Non-Goals

- no schema bump beyond `14`
- no ranking-version change
- no automatic suppression
- no automatic hiding
- no recommendation lifecycle mutation from audit or retention logic
- no new assistant mutation surface
- no MCP mutation tools for policy retention

## Verification Plan

Automated:

- `npm run typecheck`
- `npm test`
- repeat `npm test` three additional consecutive times after the final patch set

Coverage targets:

- assistant-safe audit omission and sanitization
- operator audit raw behavior
- policy recent-exit reporting
- policy retention-candidate reporting
- prune dry-run and live prune behavior
- prune non-impact on proposal rows
- status and worklist policy summaries
- assistant-safe HTTP audit shaping
- operator-only policy prune transport behavior

Live:

- rebuild the daemon bundle
- create a pre-rollout snapshot
- restart the LaunchAgent
- verify:
  - `status`
  - `doctor --deep`
  - `recommendation policy`
  - `worklist`
  - assistant-safe audit HTTP reads

## Documentation Closeout

Phase 18 completion requires updates to:

- `README.md`
- `CLIENTS.md`
- `docs/PHASE-18-PLAN.md`
- `docs/PHASE-18-ROLLOUT.md`
- `docs/2026-03-24-system-audit.md`

## Default Next Docket

If Phase 18 lands cleanly, the next sensible phase is:

- Phase 19: policy history compression and operator governance hygiene
