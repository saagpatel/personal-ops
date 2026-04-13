# Assistant-Led Phase 30 Rollout

## Intent

Phase 30 is the assistant-led surfaced-work usefulness phase, not the repo's older legacy `PHASE-30-*` governance work.

The goal is simple:

- keep the product's current ranking and authority model exactly as-is
- add a narrow local memory layer for the top surfaced work only
- prove whether the work the system surfaces is actually being acted on

## What shipped

Phase 30 adds one small SQLite-backed outcome memory layer:

- `surfaced_work_outcomes`

It tracks only the top surfaced work on three read surfaces:

- `workspace_home`
- the top assistant action
- the top `now-next` workflow action

It also adds one derived helpfulness summary with descriptive levels only:

- `unproven`
- `helpful`
- `mixed`
- `weak`

## Scenarios

### 1. Repair-owned workspace focus

When `workspace_home` is repair-owned:

- the surfaced repair step is tracked as open
- the record closes as `helpful` when matching repair progress resolves the surfaced step
- the record closes as `attempted_failed` when the matching repair execution fails

### 2. Top assistant action

When an assistant action is the top surfaced assistant item:

- the action is tracked by `assistant_action_id`
- successful progression closes it as `helpful`
- failure closes it as `attempted_failed`
- replacement by a different top assistant action closes it as `superseded`
- inactivity beyond 24 hours closes it as `expired`

### 3. Top now-next workflow item

When the top `now-next` item has stable planning-backed identity:

- the surfaced workflow item is tracked by `target_type`, `target_id`, and `planning_recommendation_id`
- it closes as `helpful` when the backing planning recommendation gains `first_action_at` or resolves
- untracked top workflow items without stable planning-backed identity stay out of scope in this phase

### 4. Maintenance-owned workspace focus

When `workspace_home` is maintenance-owned:

- the surfaced maintenance family is tracked by maintenance step id
- a successful maintenance run closes it as `helpful`
- a handoff into repair closes it as `attempted_failed`

## Surface proof

Phase 30 exposes the helpfulness read model additively in:

- `personal-ops status`
- the console workspace-focus card
- the console-backed desktop shell
- the top assistant action payload
- `personal-ops workflow now-next`

This is evidence only.

Phase 30 does not change:

- worklist ordering
- workflow ranking
- workflow personalization tuning
- repair-first precedence
- maintenance precedence
- any user-facing command surface

## Guardrail proof

Phase 30 does not add:

- new HTTP routes
- new MCP tools
- new browser execution paths
- new user-facing commands
- new trust-boundary exceptions

It adds one narrow local memory source solely to record and summarize top surfaced-work outcomes.

## Next step

The intended next assistant-led target after this phase is:

- **Assistant-Led Phase 31: Cross-Surface Noise Reduction**

Phase 31 should use the new surfaced-work outcome memory to quiet recurring low-value surfaced work without widening authority or changing queue ownership.
