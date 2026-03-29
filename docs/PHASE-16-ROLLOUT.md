# Phase 16 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Ship operator-facing tuning refinement and reviewed-family aging discipline on the live shared-machine install without changing schema, ranking behavior, recommendation lifecycle state, or assistant mutation scope.

## Rollout Steps

1. Extend the tuning and hygiene read models in the service layer.
2. Add assistant-safe proposal-metadata redaction for hygiene reads.
3. Add active `attention_families` and operator-only `recently_closed_families`.
4. Refine follow-through worklist shaping so non-stale proposals do not raise a follow-through item.
5. Add service and HTTP coverage for the new trust-boundary and tuning behavior.
6. Rebuild the daemon bundle and restart the LaunchAgent.
7. Re-run live `status`, `doctor`, `worklist`, `recommendation summary`, `recommendation tuning`, and `recommendation hygiene`.
8. Perform one low-risk live review/proposal/dismiss/cleanup loop against a temporary task-backed family.
9. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `67/67` passing

Stability follow-up:

- reran `npm test` three additional consecutive times
- final expectation: `67/67` passing on each repeat run

Phase 16 verification adds:

- assistant-safe hygiene redaction for proposal note and attribution
- safe tuning attention-family visibility for assistants
- operator-only recent closed-family tuning history
- dismissed-family reopening to `review_needed` when new evidence lands
- follow-through worklist suppression for `proposal_open` and `proposal_dismissed`
- formatter coverage for active attention and recent-history tuning output

## Live Rollout Verification

### Pre-rollout snapshot

Snapshot created before restart:

- snapshot id: `2026-03-25T00-35-11Z`
- path: `/Users/d/Library/Application Support/personal-ops/snapshots/2026-03-25T00-35-11Z`

### Daemon restart

Restart path used:

- `launchctl bootout gui/$(id -u) /Users/d/Library/LaunchAgents/com.d.personal-ops.plist`
- `launchctl bootstrap gui/$(id -u) /Users/d/Library/LaunchAgents/com.d.personal-ops.plist`

Observed result:

- restart succeeded cleanly on the first pass
- daemon reachable after restart
- live tuning output picked up the new Phase 16 fields immediately after restart

### Live health evidence

`personal-ops status --json`

- state: `ready`
- schema current: `13`
- schema expected: `13`
- ranking remains `phase12-v1`
- final steady state after cleanup:
  - tasks `active_count = 0`
  - tasks `historical_count = 12`
  - planning `active_count = 4`
  - planning `historical_count = 9`
  - planning `manual_scheduling_count = 0`
  - planning `proposal_open_count = 0`
  - planning `proposal_dismissed_count = 0`

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `13`
- schema compatibility: `true`

`personal-ops recommendation tuning --json`

- `attention_families` is live
- `recently_closed_families` is live
- final steady-state tuning report returned:
  - zero active proposal counts
  - `attention_families = []`
  - `recently_closed_families = []`

`personal-ops recommendation hygiene --json`

- proposal metadata remains visible to operator reads
- final steady state returned only the existing inbox follow-up family with no proposal state

`personal-ops worklist --json`

- worklist stayed item-based
- no follow-through item remained after cleanup

### Live low-risk operator action

Phase 16 live verification used one temporary task-backed family:

1. Created temporary task `Phase 16 rollout temp task`
2. Ran `personal-ops recommendation refresh`
3. Confirmed a live hygiene candidate appeared for:
   - `group = urgent_unscheduled_tasks`
   - `kind = schedule_task_block`
   - `source = system_generated`
   - `recommended_action = review_externalized_workflow`
   - `follow_through_state = review_needed`
4. Re-ran operator review through:
   - `personal-ops recommendation hygiene review --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --decision investigate_externalized_workflow --note "Phase 16 rollout verification" --json`
5. Recorded a live proposal through:
   - `personal-ops recommendation hygiene proposal record --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --note "Phase 16 rollout proposal" --json`
6. Confirmed:
   - operator tuning showed the family in `attention_families`
   - family `follow_through_state = proposal_open`
   - family `proposal_status = proposed`
   - status `proposal_open_count = 1`
   - tracked recommendation kept:
     - `ranking_version = phase12-v1`
     - `rank_score = 360`
     - `updated_at = 2026-03-25T00:36:21.130Z`
7. Verified assistant-safe HTTP reads:
   - hygiene returned `proposal_note = null`
   - hygiene returned `proposal_by_client = null`
   - hygiene returned `proposal_by_actor = null`
   - tuning kept `attention_families`
   - tuning returned `recently_closed_families = []`
8. Dismissed the proposal through:
   - `personal-ops recommendation hygiene proposal dismiss --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --note "Phase 16 rollout cleanup" --json`
9. Canceled the temporary task with note `Phase 16 live rollout cleanup`
10. Ran `personal-ops recommendation refresh`
11. Confirmed final cleanup:
   - temporary task moved to `state = canceled`
   - temporary recommendation moved into history with `outcome_state = source_resolved`
   - final status returned to zero active proposal counts
   - final tuning returned no active attention or recent-history rows

## Boundary Verification

Confirmed at the end of rollout:

- assistants still cannot review hygiene families
- assistants still cannot record or dismiss hygiene proposals
- assistants still cannot apply, reject, snooze, or replan recommendations
- assistants can still read safe tuning attention detail
- assistants can no longer read proposal note or proposal attribution on hygiene reads
- assistants still do not receive `recently_closed_families` from tuning
- proposal state remains explicit, reviewable, and non-enforcing
- no automatic suppression or hiding was introduced
- no recommendation lifecycle mutation was introduced from Phase 16 read shaping

## Residual Risks

Non-blocking follow-up noted at closeout:

- assistant-safe hygiene still exposes operator review-note and review-attribution fields because Phase 16 intentionally scoped redaction to proposal metadata only
- assistant-safe raw recommendation detail remains broader than tuning/hygiene safe-read shaping; that broader recommendation-detail trust review remains a Phase 17 candidate, not a Phase 16 blocker

## Recommendation

Phase 16 is complete and live.

The next sensible phase is Phase 17: policy lifecycle governance without execution.
