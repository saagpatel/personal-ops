# Phase 18 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Ship assistant-safe audit shaping plus operator-controlled policy-history retention on the live shared-machine install without changing schema version, ranking behavior, recommendation lifecycle state, or assistant mutation scope.

## Rollout Steps

1. Add assistant-safe audit shaping in the shared service layer.
2. Keep raw operator audit reads unchanged.
3. Add operator-only policy prune mutation across CLI and HTTP.
4. Extend `recommendation policy` with recent exits and retention candidates.
5. Add compact planning-policy signals to `status` and `worklist`.
6. Add automated coverage for assistant-safe audit shaping, retention, prune behavior, and cross-phase regression.
7. Rebuild the daemon bundle.
8. Create a live snapshot before daemon restart.
9. Restart the LaunchAgent and re-run live checks.
10. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `74/74` passing

Repeated stability evidence after the final patch set:

- `npm test` repeated three additional consecutive times
- each rerun finished `74/74` passing

Phase 18 verification adds:

- assistant-safe audit omission for sensitive/operator-only actions
- assistant-safe audit sanitization for visible safe operational actions
- raw operator audit behavior remaining intact
- policy recent-exit reporting coverage
- policy retention-candidate reporting coverage
- policy prune dry-run coverage
- policy prune live-delete coverage
- proof that prune deletes governance-event rows only
- status and worklist policy-summary coverage
- assistant-safe HTTP audit transport coverage
- operator-only HTTP policy-prune coverage

## Live Rollout Verification

### Pre-restart snapshot

`personal-ops backup create --json`

- snapshot id: `2026-03-25T02-16-52Z`
- daemon state at snapshot time: `ready`

### Live health evidence after restart

`launchctl kickstart -k gui/$(id -u)/com.d.personal-ops`

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains `phase12-v1`
- Phase 18 compact policy signals are live:
  - `policy_recent_exit_count = 1`
  - `policy_retention_candidate_count = 0`
  - `top_policy_recent_exit_summary` is present

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `14`
- schema compatibility: `true`

`personal-ops recommendation policy --json`

- Phase 18 cross-horizon policy report is live
- final steady-state report returned:
  - `recent_policy_exit_count = 1`
  - `retention_candidate_count = 0`
  - `recent_policy_exits` contains the live inactive proposal-backed family
  - `retention_candidates = []`

`personal-ops worklist --json`

- Phase 18 policy-governance worklist pressure is live
- final steady-state worklist returned:
  - `planning_policy_governance_needed`
  - no `planning_policy_retention_review_needed` item in steady state

### Live assistant-safe audit evidence

Assistant-safe HTTP audit read:

- `GET /v1/audit/events?limit=5` succeeded with the assistant token
- sensitive/operator-only audit events were omitted
- visible sync events returned:
  - sanitized `metadata_json`
  - `summary`
  - `metadata_redacted = true`

Observed live assistant-safe examples:

- `calendar_sync` returned only provider plus safe refresh counters
- `mailbox_sync` returned only safe refresh counters
- snapshot creation did not appear in the assistant-safe result

### Live operator audit evidence

`personal-ops audit tail --limit 5 --json`

- operator audit remains raw
- raw audit metadata still includes full sync payloads for operator inspection

## Boundary Verification

Confirmed at the end of rollout:

- assistants still cannot prune policy history
- assistants still cannot read the operator-only policy report through a new safe variant because none was added in Phase 18
- assistants still cannot archive or supersede policy history
- assistants now get least-privilege audit reads instead of broad raw audit history
- unknown future audit actions are hidden from assistant-safe audit reads by default
- policy prune remains operator-only and manual
- policy prune stays non-enforcing and does not delete proposal rows
- no automatic suppression or hiding was introduced
- no ranking-version change was introduced
- no recommendation lifecycle mutation was introduced from Phase 18 retention behavior

## Residual Risks

Non-blocking follow-up noted at closeout:

- `recommendation policy` now connects active backlog, recent exits, history, and retention candidates, but repeated long-horizon history may still grow noisy over time
- assistant-safe audit shaping is now much tighter, but a later phase may still want to compress or regroup low-value historical policy cycles for the operator

## Recommendation

Phase 18 is complete and live.

The next sensible phase is Phase 19: policy history compression and operator governance hygiene.
