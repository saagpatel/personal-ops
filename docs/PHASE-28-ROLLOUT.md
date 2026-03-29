# Phase 28 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Review the live governance surfaces as the supported baseline and make only the smallest evidence-backed human-readable cleanup needed to reduce lingering repetition.

## Rollout Steps

1. Keep the public governance surface unchanged.
2. Review live `status`, `recommendation policy`, `worklist`, and assistant-safe audit together as the evidence baseline.
3. Limit changes to a tiny formatter cleanup only where that evidence shows remaining noise.
4. Re-run automated verification and repeated stability reruns.
5. Rebuild the daemon bundle.
6. Create a live snapshot before daemon restart.
7. Restart the LaunchAgent and re-run live checks.
8. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `81/81` passing

Repeated stability evidence after the final patch set:

- `npm test` repeated three additional consecutive times
- each rerun finished `81/81` passing

Phase 28 verification adds:

- proof that human-readable `recommendation policy` keeps the supported section order while trimming repeated summary labels
- proof that grouped history remains the higher-level history view and raw governance events remain secondary
- proof that human-readable `status` still shows one primary `Policy attention` line
- proof that `recommendation policy`, `status`, and `worklist` remain aligned on the same primary policy-attention state
- proof that assistant-safe audit behavior remains unchanged from Phase 27
- proof that operator audit remains raw

## Live Rollout Verification

### Pre-restart snapshot

`personal-ops backup create --json`

- snapshot id: `2026-03-25T04-24-29Z`
- daemon state at snapshot time: `ready`

### Live health evidence after restart

`launchctl kickstart -k gui/$(id -u)/com.d.personal-ops`

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains: `phase12-v1`
- compact policy attention remains live:
  - `policy_attention_kind = "recent_exit"`
  - `top_policy_attention_summary` populated

`personal-ops status`

- human-readable output still shows one primary `Policy attention` line

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
- grouped-history and raw-governance sections still render normally with lighter summary labels

`personal-ops worklist --json`

- worklist still emits at most one policy item
- current live steady state includes:
  - `planning_policy_governance_needed`

Assistant-safe `GET /v1/audit/events?limit=5`

- returned the same safe event families as Phase 27 during live verification
- visible events still include:
  - sanitized `metadata_json`
  - `summary`
  - `metadata_redacted = true`
  - `assistant_safe_category`

Operator `GET /v1/audit/events?limit=5`

- remained raw and unchanged

## Boundary Verification

Phase 28 is intended to confirm:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains operator-only
- assistant-safe audit remains a fixed categorized feed with no filters
- no new mutation surface is added
- archive, supersede, and prune semantics stay unchanged
- no automatic suppression, hiding, lifecycle mutation, or execution behavior is introduced

## Residual Risks

Expected non-blocking follow-up after closeout:

- any later human-facing simplification should still be driven by real usage rather than cleanup momentum
- assistant-safe audit remains intentionally fixed and may still deserve a later ergonomics review after more usage

## Recommendation

Phase 28 is complete and live.

The next sensible phase is Phase 29: selective governance ergonomics follow-through.
