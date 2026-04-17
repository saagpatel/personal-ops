# Phase 23 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Confirm the current governance surfaces as the supported baseline, consolidate internal policy-attention derivation, and prove the shared control plane stays stable without changing the public contract.

## Rollout Steps

1. Keep the public governance surface unchanged.
2. Consolidate the internal policy-attention decision path used by `recommendation policy`, `status`, and `worklist`.
3. Add cross-surface regression coverage for `recent_exit`, `history_churn`, `retention_candidate`, and `none`.
4. Rebuild the daemon bundle.
5. Create a live snapshot before daemon restart.
6. Restart the LaunchAgent and re-run live checks.
7. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `78/78` passing

Repeated stability evidence after the final patch set:

- `npm test` repeated three additional consecutive times
- each rerun finished `78/78` passing

Phase 23 verification adds:

- proof that `recommendation policy`, `status`, and `worklist` stay aligned for all primary policy-attention states
- proof that compact policy counts remain present and match the detailed policy-report totals they summarize
- proof that `worklist` still emits at most one policy item
- proof that assistant-safe audit behavior remains unchanged from Phase 22
- proof that operator audit remains raw

## Live Rollout Verification

### Pre-restart snapshot

`personal-ops backup create --json`

- snapshot id: `2026-03-25T03-26-05Z`
- daemon state at snapshot time: `ready`

### Live health evidence after restart

`launchctl kickstart -k gui/$(id -u)/com.d.personal-ops`

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains `phase12-v1`
- compact policy fields remain live:
  - `policy_recent_exit_count = 1`
  - `policy_retention_candidate_count = 0`
  - `policy_attention_kind = "recent_exit"`
  - `top_policy_attention_summary` populated

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `14`
- schema compatibility: `true`

`personal-ops recommendation policy --json`

- policy report remains unchanged in scope and meaning
- `policy_attention_kind`, `policy_attention_summary`, and `policy_attention_command` remain live
- `policy_history_recent_events` remains the raw-governance drill-down field

`personal-ops recommendation policy`

- human-readable output still leads with `Primary Policy Attention`
- grouped-history and raw-governance sections still render normally

`personal-ops worklist --json`

- worklist still emits at most one policy item
- current live steady state includes:
  - `planning_policy_governance_needed`

Assistant-safe `GET /v1/audit/events?limit=5`

- returned the same safe event families as Phase 22 during live verification
- visible events still include:
  - sanitized `metadata_json`
  - `summary`
  - `metadata_redacted = true`
  - `assistant_safe_category`

Operator `GET /v1/audit/events?limit=5`

- remained raw and unchanged

## Boundary Verification

Confirmed at the end of rollout:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains operator-only
- assistant-safe audit remains a fixed categorized feed with no filters
- no new mutation surface was added
- archive, supersede, and prune semantics stayed unchanged
- no automatic suppression, hiding, lifecycle mutation, or execution behavior was introduced

## Residual Risks

Non-blocking follow-up noted at closeout:

- the current governance surface is now much clearer, but later phases may still decide whether the remaining compact counts in `status` are worth keeping after longer real usage
- assistant-safe audit remains intentionally fixed and may still deserve a later ergonomics review after more usage

## Recommendation

Phase 23 is complete and live.

The next sensible phase is Phase 24: supported surface baseline and usage-driven reduction review.
