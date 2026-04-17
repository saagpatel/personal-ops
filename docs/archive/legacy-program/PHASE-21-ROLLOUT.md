# Phase 21 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Remove the deprecated operator-only `policy_history` alias from the shared policy-report contract while keeping schema version, ranking behavior, assistant-safe audit behavior, compact policy semantics, and all trust boundaries unchanged.

## Rollout Steps

1. Remove `policy_history` from the shared policy-report type.
2. Keep `policy_history_recent_events` as the only raw-governance field.
3. Update service shaping, HTTP payload expectations, and first-party tests.
4. Keep all other compatibility fields and policy-attention behavior unchanged.
5. Rebuild the daemon bundle.
6. Create a live snapshot before daemon restart.
7. Restart the LaunchAgent and re-run live checks.
8. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `77/77` passing

Repeated stability evidence after the final patch set:

- `npm test` repeated three additional consecutive times
- each rerun finished `77/77` passing

Phase 21 verification adds:

- proof that `policy_history` is removed from the shared policy-report shape
- proof that `policy_history_recent_events` remains the sole raw-governance field
- proof that grouped-history behavior remains unchanged
- proof that primary policy-attention behavior remains unchanged
- proof that deprecated compact status compatibility fields remain present
- proof that worklist still emits at most one policy item
- proof that assistant-safe audit behavior remains unchanged from Phase 20
- proof that operator audit reads remain raw

## Live Rollout Verification

### Pre-restart snapshot

`personal-ops backup create --json`

- snapshot id: `2026-03-25T03-03-51Z`
- daemon state at snapshot time: `ready`

### Live health evidence after restart

`launchctl kickstart -k gui/$(id -u)/com.d.personal-ops`

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains `phase12-v1`
- compact policy attention remains live:
  - `policy_attention_kind = "recent_exit"`
  - `top_policy_attention_summary` populated
- deprecated compact compatibility fields remain present:
  - `top_policy_recent_exit_summary`
  - `top_policy_retention_candidate_summary`

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `14`
- schema compatibility: `true`

`personal-ops recommendation policy --json`

- `policy_history` is absent
- `policy_history_recent_events` remains present as the only raw-governance field
- Phase 20 policy-attention fields remain live:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`

`personal-ops recommendation policy`

- human-readable policy output remains unchanged in structure
- grouped-history and raw-governance sections still render normally

`personal-ops worklist --json`

- worklist still emits at most one policy item
- current live steady state includes:
  - `planning_policy_governance_needed`

Assistant-safe `GET /v1/audit/events?limit=5`

- returned the same safe event families as Phase 20 during live verification
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
- assistant-safe audit remains a fixed categorized feed with no new filters
- `recommendation policy` remains operator-only
- no new mutation surface was added
- archive, supersede, and prune semantics stayed unchanged
- compact policy status/worklist semantics stayed unchanged
- no automatic suppression, hiding, lifecycle mutation, or execution behavior was introduced

## Residual Risks

Non-blocking follow-up noted at closeout:

- deprecated compact status compatibility fields still remain and should be reviewed for possible Phase 22 removal
- assistant-safe audit remains intentionally fixed and unfiltered, which may still deserve a later ergonomics review after more usage

## Recommendation

Phase 21 is complete and live.

The next sensible phase is Phase 22: final compatibility retirement and audit feed review.
