# Phase 17 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Ship explicit long-horizon policy governance and tighter assistant-safe planning history reads on the live shared-machine install without changing ranking behavior, recommendation lifecycle state, or assistant mutation scope.

## Rollout Steps

1. Add schema `14` support for append-only planning policy governance events.
2. Add operator-only policy archive and supersede mutation across the service, CLI, and HTTP layers.
3. Add operator-only `recommendation policy` reads across CLI and HTTP.
4. Tighten assistant-safe hygiene read shaping for review-authored metadata.
5. Tighten assistant-safe planning recommendation detail shaping for planning-policy audit history.
6. Add automated coverage for schema migration, governance behavior, and trust-boundary shaping.
7. Rebuild the daemon bundle and verify the live shared-machine runtime.
8. Re-run operator and assistant-safe HTTP checks against the live daemon.
9. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `71/71` passing

Phase 17 verification adds:

- schema `13 -> 14` migration coverage for policy governance events
- operator-only archive and supersede mutation coverage
- policy backlog versus policy history separation coverage
- assistant-safe recommendation-detail audit redaction coverage
- assistant-safe hygiene review-metadata redaction coverage
- operator-only policy read transport coverage

## Live Rollout Verification

### Live health evidence

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains `phase12-v1`
- final steady state after verification:
  - planning `active_count = 4`
  - planning `historical_count = 9`
  - planning `proposal_open_count = 0`
  - planning `proposal_dismissed_count = 0`

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `14`
- schema compatibility: `true`

`personal-ops recommendation policy --json`

- operator-only policy report is live
- final steady-state report returned:
  - `active_proposed_count = 0`
  - `active_dismissed_for_now_count = 0`
  - `archived_count = 0`
  - `superseded_count = 0`
  - `active_policy_backlog = []`
  - `policy_history = []`

`personal-ops recommendation tuning --json`

- tuning remains the active follow-through surface
- final steady-state report returned:
  - zero active review/proposal follow-through counts
  - `attention_families = []`
  - `recently_closed_families = []`

### Live operator and assistant-safe HTTP checks

Operator HTTP policy read:

- `GET /v1/planning-recommendations/policy` succeeded with the operator token
- returned the same empty steady-state policy report as the CLI

Assistant HTTP policy read:

- `GET /v1/planning-recommendations/policy` returned `400`
- error message: `Only the operator channel may read planning policy governance.`

Assistant-safe recommendation detail:

- `GET /v1/planning-recommendations/<id>` succeeded with the assistant token
- returned normal recommendation detail
- returned `related_audit_events = []` on the sampled live recommendation, confirming planning-policy audit history is no longer surfaced through assistant-safe detail

## Boundary Verification

Confirmed at the end of rollout:

- assistants still cannot archive or supersede planning policy state
- assistants still cannot read the operator-only policy report
- assistants still cannot review hygiene families
- assistants still cannot record or dismiss hygiene proposals
- assistants still cannot apply, reject, snooze, or replan recommendations
- assistants now lose access to operator review note and operator review attribution on assistant-safe hygiene reads
- assistants now lose access to planning-policy audit history in assistant-safe recommendation detail
- policy governance remains explicit, operator-authored, and non-enforcing
- no automatic suppression or hiding was introduced
- no recommendation lifecycle mutation was introduced from Phase 17 governance state

## Residual Risks

Non-blocking follow-up noted at closeout:

- global `audit_events_recent` semantics remain unchanged, so a broader least-privilege review of assistant-visible audit history is still a possible later phase if the trust boundary should tighten beyond planning-specific surfaces
- the live shared machine ended the rollout in a clean steady state with no active policy backlog or policy history rows, so the strongest archive/supersede evidence remains in automated coverage rather than a retained live family

## Recommendation

Phase 17 is complete and live.

The next sensible phase is Phase 18: assistant-safe audit boundary and history retention review.
