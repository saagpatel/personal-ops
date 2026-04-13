# Assistant-Led Phase 30 Plan

Date: 2026-04-13
Status: Complete

## Goal

Prove whether the top surfaced work in the assistant-led workspace is actually being acted on, without changing ranking, precedence, or authority.

This is the assistant-led Phase 30 track. It is intentionally separate from the older legacy `PHASE-30-*` governance docs.

## Roadmap Preservation First

Before any implementation work:

- refresh `docs/ASSISTANT-LED-ROADMAP.md`
- preserve the current shipped baseline:
  - Phases 1 through 29 complete
  - Cluster B complete
  - post-Cluster-B stabilization merged
- explicitly record Assistant-Led Phase 30 as the next in-progress target
- keep assistant-led documentation separate from the legacy `PHASE-30-*` docs

This preservation step happens first so compaction never loses the current assistant-led baseline.

## Scope

Phase 30 adds one narrow usefulness-proof layer for top surfaced work only:

- `workspace_home`
- top assistant action
- top `now-next` action

Phase 30 also adds:

- one small local SQLite table for surfaced-work outcomes
- one derived helpfulness read model over that outcome history
- additive helpfulness visibility across:
  - `status`
  - the console workspace-focus card
  - the console-backed desktop shell
  - top assistant action payloads
  - `workflow now-next`

## Out of Scope

- `prep-day`
- secondary surfaced items
- ranking changes
- precedence changes
- quieting or auto-suppression based on outcome history
- new HTTP routes
- new MCP tools
- browser mutation expansion
- new user-facing commands

## Outcome Memory Layer

Phase 30 should add one SQLite table:

- `surfaced_work_outcomes`

It should store one active open outcome record per unique surfaced `surface + target` pair.
If the same surfaced top work reappears, the system should update `last_seen_at` instead of creating duplicates.

### Shared Types

Phase 30 should add:

- `SurfacedWorkSurface`
  - `workspace_home`
  - `assistant_top_action`
  - `workflow_now_next`
- `SurfacedWorkOutcomeState`
  - `open`
  - `helpful`
  - `attempted_failed`
  - `superseded`
  - `expired`
- `SurfacedWorkEvidenceKind`
  - `repair_progressed`
  - `repair_failed`
  - `assistant_progressed`
  - `assistant_failed`
  - `planning_progressed`
  - `maintenance_completed`
  - `maintenance_handed_off`
  - `superseded`
  - `timed_out`
- `SurfacedWorkOutcomeRecord`
- `SurfacedWorkHelpfulnessLevel`
  - `unproven`
  - `helpful`
  - `mixed`
  - `weak`
- `SurfacedWorkHelpfulnessSummary`

### Recommended Record Shape

- `outcome_id`
- `surface`
- `surfaced_state`
- `target_type`
- `target_id`
- `assistant_action_id`
- `planning_recommendation_id`
- `repair_step_id`
- `maintenance_step_id`
- `summary_snapshot`
- `command_snapshot`
- `surfaced_at`
- `last_seen_at`
- `state`
- `evidence_kind`
- `acted_at`
- `closed_at`

## Deterministic Tracking Rules

### `workspace_home`

Track only when `workspace_home.state` is one of:

- `repair`
- `assistant`
- `workflow`
- `maintenance`

Bindings:

- `repair` uses `repair_step_id = first_repair_step`
- `assistant` uses `assistant_action_id = workspace_home.assistant_action_id`
- `workflow` uses the top `now-next` action only when it has stable target identity plus a backing planning recommendation id
- `maintenance` uses `maintenance_step_id` from maintenance decision or convergence

Outcome rules:

- `repair` becomes `helpful` when repair progress clears or advances the surfaced step
- `repair` becomes `attempted_failed` when matching repair execution fails
- `assistant` becomes `helpful` when the same actionable assistant item progresses successfully
- `assistant` becomes `attempted_failed` when the same surfaced item fails
- `workflow` becomes `helpful` only when the backing planning recommendation gains `first_action_at` or resolves
- `maintenance` becomes `helpful` when a matching maintenance run completes without repair handoff
- `maintenance` becomes `attempted_failed` when the surfaced family hands off into repair

### `assistant_top_action`

Track only the top actionable assistant action.

Rules:

- stable identifier is `assistant_action_id`
- `helpful` when the surfaced action progresses successfully
- `attempted_failed` when it fails
- `superseded` when a different assistant action becomes top first
- `expired` after 24 hours without matching progress

### `workflow_now_next`

Track only the top `now-next` action when all of these are true:

- it is the first `now-next` action
- it has stable `target_type` and `target_id`
- it carries a backing `planning_recommendation_id`

If the top `now-next` action does not have stable planning-backed identity, Phase 30 should not create a workflow outcome record.

Rules:

- `helpful` when the backing planning recommendation gains `first_action_at` or resolves after surfacing
- `superseded` when another top `now-next` action replaces it first
- `expired` after 24 hours without progress or resurfacing

## Helpfulness Read Model

Phase 30 should add one derived helper over the new outcome table, for example:

- `buildSurfacedWorkHelpfulnessSummary(...)`

Recommended summary fields:

- `eligible`
- `surface`
- `target_type`
- `target_id`
- `level`
- `summary`
- `sample_count_30d`
- `helpful_count_30d`
- `attempted_failed_count_30d`
- `superseded_count_30d`
- `expired_count_30d`
- `helpful_rate_30d`

Use a 30-day lookback.

### Level Rules

- `unproven` when closed sample count is under `3`
- `helpful` when `helpful_rate_30d >= 0.6` and attempted-failed count stays low
- `mixed` when `helpful_rate_30d` is between `0.3` and `0.6`
- `weak` when `helpful_rate_30d < 0.3`

### Fixed Summary Text

- `unproven`: “This surfaced work does not have enough recent outcome history yet.”
- `helpful`: “Recent outcomes suggest this surfaced work is usually acted on.”
- `mixed`: “Recent outcomes are mixed; this surfaced work is sometimes acted on and sometimes passed over.”
- `weak`: “Recent outcomes suggest this surfaced work is often surfaced without follow-through.”

## Surface Integration

Phase 30 should expose helpfulness proof additively only in:

- `personal-ops status`
- `personal-ops console`
- the console-backed desktop shell
- top assistant action payloads
- `personal-ops workflow now-next`

Rules:

- `status` shows one compact helpfulness line for the current workspace focus when eligible
- the console workspace-focus card shows the same helpfulness summary when eligible
- the top assistant action card shows helpfulness only for the tracked top action
- `now-next` shows helpfulness only for the tracked top surfaced action
- `prep-day` stays out of scope
- browser and console remain read-only consumers
- all writes happen service-side during existing status, assistant, and workflow report generation

## Guardrails

- no change to `worklist` ordering
- no change to `compareAttentionItems()`
- no change to workflow ranking
- no change to workflow personalization tuning
- no change to repair-first precedence
- no new HTTP routes
- no new MCP tools
- no new user-facing commands
- no browser execution expansion

## Test Plan

Phase 30 should directly cover:

- roadmap update happens first and uses assistant-led file naming only
- `workspace_home` repair focus creates an open outcome record and closes as `helpful` on repair progress
- `workspace_home` repair focus closes as `attempted_failed` on matching failed repair execution
- top assistant action creates an open outcome record and closes as `helpful` on successful progression
- top assistant action closes as `attempted_failed` on failure
- top assistant action closes as `superseded` when another assistant action becomes top first
- top `now-next` action with a backing planning recommendation creates an open record and closes as `helpful` when `first_action_at` appears
- top `now-next` action without stable planning-backed identity does not create a record
- maintenance workspace focus closes as `helpful` on successful maintenance completion
- maintenance workspace focus closes as `attempted_failed` when the family hands off into repair
- resurfacing the same top item updates the same open record instead of duplicating it
- open surfaced-work records expire after 24 hours without progress
- helpfulness levels compute correctly for `unproven`, `helpful`, `mixed`, and `weak`
- `status`, console workspace focus, assistant top action, and `now-next` agree on the same helpfulness summary when they refer to the same tracked surfaced work
- no change to `worklist` ordering
- no change to workflow ranking or personalization tuning
- no new HTTP routes, MCP tools, browser execution paths, or user-facing commands

## Verification Gates

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

If any Codex operating surface is touched, rerun the relevant local verification before closeout and still finish with the full gate above.

## Closeout Contract

Before PR creation:

- confirm every planned Phase 30 item is complete
- confirm no unrelated dirty repo changes remain
- add `docs/ASSISTANT-LED-PHASE-30-ROLLOUT.md`
- update the roadmap again so Phase 30 is marked complete and the next phase target is named

At phase close:

- summarize what shipped
- summarize what was verified
- confirm merge and cleanup are complete
- explicitly name the next phase target

## Default Next Target

If Phase 30 lands cleanly, the next assistant-led phase should be:

- Phase 31: Cross-Surface Noise Reduction

That next phase should use outcome memory from Phase 30 to quiet recurring low-value surfaced work without widening authority.
