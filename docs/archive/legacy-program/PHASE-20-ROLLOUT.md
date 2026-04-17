# Phase 20 Rollout Record

Date: 2026-03-25
Status: Complete

## Rollout Goal

Ship an explicit assistant-safe audit policy registry and simplify compact operator policy signals without changing schema version, ranking behavior, policy-governance mutation semantics, assistant mutation scope, or recommendation lifecycle state.

## Rollout Steps

1. Add explicit assistant-safe audit categories to the shared audit type.
2. Refactor assistant-safe audit shaping into an explicit policy registry.
3. Keep the effective assistant-visible audit set substantially unchanged.
4. Add primary policy-attention fields to the operator policy report.
5. Simplify `status` so policy attention renders as one primary line.
6. Simplify `worklist` so only one policy item is emitted at a time.
7. Keep `policy_history_recent_events` preferred and retain `policy_history` as a deprecated alias for one more phase.
8. Add automated coverage for assistant-safe audit categories and primary policy attention.
9. Rebuild the daemon bundle.
10. Create a live snapshot before daemon restart.
11. Restart the LaunchAgent and re-run live checks.
12. Update README, client contract, phase docs, and the master audit.

## Automated Verification

Final automated result:

- `npm run typecheck`
- `npm test`
- result: `77/77` passing

Repeated stability evidence after the final patch set:

- `npm test` repeated three additional consecutive times
- each rerun finished `77/77` passing

Phase 20 verification adds:

- explicit assistant-safe audit-category coverage for visible events
- hidden-by-default coverage for unknown future audit actions
- proof that operator audit reads remain raw
- proof that assistant-safe audit exposure stayed limited to the Phase 18 and Phase 19 safe families
- policy-attention priority coverage for:
  - `recent_exit`
  - `history_churn`
  - `retention_candidate`
  - `none`
- formatter coverage for `Primary Policy Attention`
- status formatter coverage for one primary policy-attention line
- worklist coverage proving only one policy item is emitted at a time
- continued compatibility coverage for `policy_history_recent_events` and deprecated `policy_history`

## Live Rollout Verification

### Pre-restart snapshot

`personal-ops backup create --json`

- snapshot id: `2026-03-25T02-56-33Z`
- daemon state at snapshot time: `ready`

### Live health evidence after restart

`launchctl kickstart -k gui/$(id -u)/com.d.personal-ops`

`personal-ops status --json`

- state: `ready`
- schema current: `14`
- schema expected: `14`
- ranking remains `phase12-v1`
- new compact policy attention fields are live:
  - `policy_attention_kind = "recent_exit"`
  - `top_policy_attention_summary` populated
- compatibility fields remain live:
  - `top_policy_recent_exit_summary`
  - `top_policy_retention_candidate_summary`

`personal-ops doctor --deep --json`

- final settled state: `ready`
- summary: `38 pass / 0 warn / 0 fail`
- schema version: `14`
- schema compatibility: `true`

`GET /v1/audit/events?limit=5` with the assistant token

- returned only the existing safe event families during this live check:
  - `mailbox_sync`
  - `calendar_sync`
- each visible event now included:
  - `summary`
  - `metadata_redacted = true`
  - `assistant_safe_category = "sync"`
- metadata remained sanitized and did not expose raw operator-only audit content

`GET /v1/audit/events?limit=5` with the operator token

- operator audit remained raw
- live operator output still included unsanitized sync metadata and snapshot events
- no assistant-safe category shaping was applied to operator reads

`personal-ops recommendation policy --json`

- new Phase 20 primary-attention fields are live:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
- grouped-history fields from Phase 19 remain unchanged
- raw-history compatibility alias remains unchanged:
  - `policy_history_recent_events = []`
  - `policy_history = []`

`personal-ops recommendation policy`

- operator formatter now starts with:
  - `Primary Policy Attention`
- grouped-history and raw-governance drill-down sections from Phase 19 remain present below it

`personal-ops status`

- human-readable output now emphasizes one primary `Policy attention` line
- previous equal-weight lines for top policy recent exit and top policy retention candidate no longer appear in formatted status output

`personal-ops worklist --json`

- live worklist contains at most one policy item
- current live steady state includes:
  - `planning_policy_governance_needed`
- no simultaneous `planning_policy_retention_review_needed` item was emitted during the same steady state

## Boundary Verification

Confirmed at the end of rollout:

- schema stays at `14`
- ranking stays at `phase12-v1`
- assistant-safe audit exposure remained substantially unchanged from Phase 18 and Phase 19
- unknown future audit actions remain hidden by default from assistant-safe audit reads
- `recommendation policy` remains operator-only
- no assistant-visible policy-governance surface was added
- no new mutation surface was added
- archive, supersede, and prune semantics stayed unchanged
- no automatic suppression, hiding, retention cleanup, or execution behavior was introduced

## Residual Risks

Non-blocking follow-up noted at closeout:

- `policy_history` remains as a deprecated compatibility alias for one more phase, so Phase 21 should decide whether it can be removed cleanly
- assistant-safe audit shaping is now explicit and categorized, but later real usage may still show opportunities to simplify or filter it further

## Recommendation

Phase 20 is complete and live.

The next sensible phase is Phase 21: compatibility cleanup and governance surface pruning.
