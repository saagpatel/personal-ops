# Phase 15 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Ship explicit operator-only hygiene policy proposals and reviewed-family follow-through reporting on the live shared-machine install without changing ranking behavior, recommendation lifecycle state, or assistant mutation scope.

## Rollout Steps

1. Re-baseline the source tree and stabilize the drifting Phase 9 planning test.
2. Add schema `13` with durable hygiene policy proposal storage.
3. Implement follow-through derivation and tuning/report shaping.
4. Add operator-only proposal record and dismiss mutation across CLI and HTTP.
5. Extend CLI, HTTP, MCP, status, summary, hygiene, and worklist shaping.
6. Run full automated verification.
7. Repeat the suite to confirm the planning-test stabilization held.
8. Snapshot the live machine state before restart.
9. Rebuild the daemon bundle used by the LaunchAgent.
10. Restart the live daemon against the existing shared database.
11. Verify live doctor, status, worklist, summary, tuning, hygiene, next-action, and grouped reads.
12. Perform a low-risk live review/proposal/dismiss loop and cleanup.
13. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `65/65` passing

Stability follow-up:

- reran `npm test` three additional consecutive times
- result: `65/65` passing on each repeat run

Phase 15 verification now covers:

- schema migration from `12` to `13`
- durable hygiene policy proposal upsert and dismiss behavior
- follow-through derivation for `review_needed`, `reviewed_fresh`, `reviewed_stale`, `proposal_open`, `proposal_stale`, and `proposal_dismissed`
- operator-only proposal transport enforcement with assistant-safe tuning reads
- unchanged recommendation `updated_at`, `rank_score`, and `ranking_version` during proposal mutation
- previously drifting planning apply and replan tests stabilized against time-of-day slot assumptions
- active manual-scheduling status counts now ignore closed historical recommendation rows

## Live Rollout Verification

### Pre-rollout snapshot

Snapshot created before the live restart:

- snapshot id: `2026-03-25T00-04-03Z`
- path: `/Users/d/Library/Application Support/personal-ops/snapshots/2026-03-25T00-04-03Z`

### Daemon restart

Restart path used:

- `launchctl bootout gui/$(id -u) /Users/d/Library/LaunchAgents/com.d.personal-ops.plist`
- `launchctl bootstrap gui/$(id -u) /Users/d/Library/LaunchAgents/com.d.personal-ops.plist`

Observed result:

- first bootstrap attempt returned macOS `Input/output error`
- immediate retry succeeded
- a later post-fix restart also succeeded cleanly after the final status-count correction
- daemon reachable after restart
- launch agent loaded and running

### Live health evidence

`personal-ops status --json`

- state: `ready`
- schema current: `13`
- schema expected: `13`
- ranking remains `phase12-v1`
- planning now exposes:
  - `reviewed_fresh_count`
  - `reviewed_stale_count`
  - `proposal_open_count`
  - `proposal_stale_count`
  - `proposal_dismissed_count`
  - `top_reviewed_stale_summary`
  - `top_proposal_open_summary`
  - `top_proposal_stale_summary`
- final steady state after cleanup:
  - tasks `active_count = 0`
  - tasks `historical_count = 11`
  - planning `active_count = 4`
  - planning `historical_count = 8`
  - planning `manual_scheduling_count = 0`
  - planning `proposal_open_count = 0`
  - planning `proposal_dismissed_count = 0`

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `13`
- schema compatibility: `true`

`personal-ops worklist --json`

- worklist stayed item-based
- no first-class proposal counters were added to worklist
- final steady state had no follow-through worklist item after cleanup

`personal-ops recommendation summary --json`

- reviewed/proposal counts are live
- final steady-state summary returned all reviewed/proposal counters at `0`

`personal-ops recommendation tuning --json`

- tuning report is live
- open proposal state and dismissed proposal state were both verified during rollout
- final steady-state tuning report returned all counters at `0`

`personal-ops recommendation hygiene --json`

- follow-through metadata is live:
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
- final steady state returned only the existing inbox follow-up family with no proposal state

### Live low-risk operator action

Phase 15 live verification used one temporary task-backed family:

1. Created temporary task `Phase 15 rollout temp task`
2. Ran `personal-ops recommendation refresh`
3. Confirmed a live hygiene candidate appeared for:
   - `group = urgent_unscheduled_tasks`
   - `kind = schedule_task_block`
   - `source = system_generated`
   - `recommended_action = review_externalized_workflow`
4. Re-ran operator review through:
   - `personal-ops recommendation hygiene review --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --decision investigate_externalized_workflow --note "Phase 15 rollout verification" --json`
5. Confirmed the family settled to:
   - `review_needed = false`
   - `follow_through_state = reviewed_fresh`
6. Recorded a live proposal through:
   - `personal-ops recommendation hygiene proposal record --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --note "Phase 15 rollout proposal" --json`
7. Confirmed:
   - family `follow_through_state = proposal_open`
   - family `proposal_status = proposed`
   - tuning `proposal_open_count = 1`
   - status `proposal_open_count = 1`
   - tracked recommendation stayed:
     - `rank_score = 360`
     - `ranking_version = phase12-v1`
     - `updated_at = 2026-03-25T00:05:47.188Z`
8. Dismissed the proposal through:
   - `personal-ops recommendation hygiene proposal dismiss --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --note "Phase 15 rollout cleanup" --json`
9. Confirmed:
   - family `follow_through_state = proposal_dismissed`
   - family `proposal_status = dismissed`
   - tuning `proposal_dismissed_count = 1`
   - status `proposal_dismissed_count = 1`
10. Canceled the temporary task with note `Phase 15 live rollout cleanup`
11. Ran `personal-ops recommendation refresh`
12. Confirmed final cleanup:
   - temporary task moved to `state = canceled`
   - temporary recommendation moved into history with `outcome_state = source_resolved`
   - final status returned to zero active proposal counts

Observed result:

- proposal mutation works on the live machine
- proposal state stays explicit and reviewable
- recommendation ranking and lifecycle state did not drift during proposal mutation
- final cleanup restored the live queue to its prior steady-state shape apart from the expected extra historical task and source-resolved recommendation

## Boundary Verification

Confirmed at the end of rollout:

- assistants still cannot review hygiene families
- assistants still cannot record or dismiss hygiene proposals
- assistants still cannot apply recommendations
- assistants still cannot reject recommendations
- assistants still cannot snooze recommendations
- assistants still cannot replan recommendations
- assistants still cannot mutate recommendation groups
- assistants still cannot write calendar events directly
- proposal state is explicit and schema-backed, but still non-enforcing
- no automatic suppression or hiding was introduced
- no recommendation lifecycle mutation was introduced from proposal state
- ranking remains `phase12-v1`
- schema is now `13`
- send remains operator-gated
- calendar mutation remains operator-only
