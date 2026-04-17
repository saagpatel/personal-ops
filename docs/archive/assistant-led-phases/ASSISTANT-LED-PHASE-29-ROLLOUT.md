# Assistant-Led Phase 29 Rollout

## Intent

Phase 29 is the assistant-led workspace-maturity phase, not the repo's older legacy governance Phase 29.

The goal is simple:

- the console should open with one clear answer to "what matters now"
- the desktop shell should inherit that same answer instead of drifting into generic loading or empty-state language
- assistant, workflow, repair, and maintenance surfaces should support the same story instead of competing with each other

## Scenarios

### 1. Repair owns the workspace

When there is an active repair step or maintenance/repair convergence says the family is already repair-owned:

- `workspace_home.state` becomes `repair`
- the primary command becomes `personal-ops repair plan`
- assistant, workflow, and maintenance previews remain visible, but read as next-up context instead of conflicting calls to action

### 2. Assistant-prepared work is the main focus

When there is no active repair and the top assistant action is still actionable:

- `workspace_home.state` becomes `assistant`
- the overview leads with the assistant-prepared action
- the matching assistant card stops repeating the same "why now" copy already shown in the workspace focus card

### 3. Workflow owns the next move

When there is no higher repair or assistant-owned focus and `now-next` has a strongest move:

- `workspace_home.state` becomes `workflow`
- the overview leads with the top workflow action
- the matching `now-next` preview stays actionable, but no longer restates the same explanation twice

### 4. Maintenance is the main focus

When no higher owner exists and the maintenance decision/convergence layer says upkeep is the leading bounded work:

- `workspace_home.state` becomes `maintenance`
- the overview uses the converged upkeep language once
- maintenance wording respects Phase 28 ownership, so repair-owned families do not regress into "start maintenance now"

## Guardrail proof

Phase 29 does not add:

- new persistence
- new browser execution
- new desktop-only actions
- new commands
- new queue kinds
- new trust-boundary exceptions

It is a coherence layer on top of existing read models.

## Cluster status

Cluster B closes after this phase.

- Phase 27 is implemented
- Phase 28 is implemented
- Phase 29 is implemented

After verification, the cluster should ship as one PR and merge.
