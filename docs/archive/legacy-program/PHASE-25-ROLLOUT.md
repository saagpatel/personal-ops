# Phase 25 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Remove the last compact policy count fields from `status` so compact governance signaling is limited to the primary policy-attention fields while leaving the detailed governance surface and assistant-safe audit behavior unchanged.

## Rollout Steps

1. Keep the public governance surface unchanged except for the two compact status count removals.
2. Remove `policy_recent_exit_count` and `policy_retention_candidate_count` from the shared status contract and human-readable formatter.
3. Add regression coverage for the smaller status shape and unchanged governance behavior.
4. Rebuild the daemon bundle.
5. Create a live snapshot before daemon restart.
6. Restart the LaunchAgent and re-run live checks.
7. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `79/79` passing

Repeated stability evidence after the final patch set:

- `npm test` repeated three additional consecutive times
- each rerun finished `79/79` passing

Phase 25 verification adds:

- proof that `status --json` no longer returns `policy_recent_exit_count`
- proof that `status --json` no longer returns `policy_retention_candidate_count`
- proof that `policy_attention_kind` and `top_policy_attention_summary` remain live
- proof that human-readable `status` still shows one primary `Policy attention` line
- proof that `recommendation policy` remains unchanged in contract and meaning
- proof that `worklist` still emits at most one policy item
- proof that assistant-safe audit behavior remains unchanged from Phase 24
- proof that operator audit remains raw

## Live Rollout Verification

### Pre-restart snapshot

`personal-ops backup create --json`

- snapshot id: `2026-03-25T03-48-40Z`
- daemon state at snapshot time: `ready`

### Live health evidence after restart

`launchctl kickstart -k gui/$(id -u)/com.d.personal-ops`

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains `phase12-v1`
- compact policy status counts are now absent:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
- compact policy attention remains live:
  - `policy_attention_kind = "recent_exit"`
  - `top_policy_attention_summary` populated

`personal-ops status`

- human-readable output still shows one primary `Policy attention` line
- `Policy recent exits` and `Policy retention candidates` no longer appear

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `14`

`personal-ops recommendation policy --json`

- policy report remains unchanged in scope and meaning
- `policy_attention_kind`, `policy_attention_summary`, and `policy_attention_command` remain live
- `recent_policy_exits`, `retention_candidates`, and `policy_history_recent_events` remain live

`personal-ops recommendation policy`

- human-readable output still leads with `Primary Policy Attention`
- grouped-history and raw-governance sections still render normally

`personal-ops worklist --json`

- worklist still emits at most one policy item
- current live steady state includes:
  - `planning_policy_governance_needed`

Assistant-safe `GET /v1/audit/events?limit=5`

- returned the same safe event families as Phase 24 during live verification
- visible events still include:
  - sanitized `metadata_json`
  - `summary`
  - `metadata_redacted = true`
  - `assistant_safe_category`

Operator `GET /v1/audit/events?limit=5`

- remained raw and unchanged

## Boundary Verification

Phase 25 is intended to confirm:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains operator-only
- assistant-safe audit remains a fixed categorized feed with no filters
- no new mutation surface is added
- archive, supersede, and prune semantics stay unchanged
- no automatic suppression, hiding, lifecycle mutation, or execution behavior is introduced

## Residual Risks

Expected non-blocking follow-up after closeout:

- later simplification should be driven by real usage rather than more cleanup momentum
- assistant-safe audit remains intentionally fixed and may still deserve a later ergonomics review after more usage

## Recommendation

Phase 25 is complete and live.

The next sensible phase is Phase 26: long-term supported surface review.
