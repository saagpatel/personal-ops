# Assistant-Led Phase 31 Rollout

## Intent

Phase 31 is the assistant-led cross-surface noise-reduction phase, not the repo's older legacy `PHASE-31-*` governance work.

The goal is to make the workspace calmer without changing what the system is allowed to do.

- keep the primary workspace focus fully visible
- reduce repeated wording when assistant, workflow, and workspace surfaces point at the same work
- quiet weak or mixed secondary cues when a clearer primary focus already exists

## What shipped

Phase 31 adds one shared surfaced-noise read model with four dispositions:

- `primary`
- `supporting`
- `quieted`
- `suppressed_duplicate`

It uses Phase 30 surfaced-work outcome memory plus stable identity matching to decide when secondary surfaced items should stay full-strength, become quieter, or switch to referential wording.

## Scenarios

### 1. Workspace focus and assistant top action match

When the top assistant action points at the same stable target as `workspace_home`:

- the workspace focus stays primary
- the assistant card stays actionable
- the assistant wording becomes referential instead of sounding like a second competing next move
- duplicate helpfulness text is suppressed

### 2. Workspace focus and top now-next action match

When the top `now-next` item points at the same stable target as `workspace_home`:

- the workflow action stays available
- repeated why-now text is suppressed
- repeated surfaced-work proof is suppressed
- repeated workflow-personalization wording is suppressed when it adds no distinct value

### 3. Weak or mixed secondary surfaced work

When a different clearer primary focus already exists:

- weak secondary surfaced work becomes quieter
- mixed secondary surfaced work can also become quieter
- commands remain visible
- `helpful` and `unproven` surfaced work stays visible in this phase unless it is an exact duplicate of the primary focus

### 4. No stronger primary focus

When there is no clearer actionable primary focus:

- weak or mixed surfaced work is not quieted away
- the best available surfaced item stays visible

## Surface behavior

Phase 31 updates only the existing top read surfaces:

- `personal-ops status`
- `personal-ops console`
- the console-backed desktop shell
- top assistant action payloads
- `personal-ops workflow now-next`

The phase does not change:

- worklist ordering
- workflow ranking
- workflow personalization scoring
- maintenance or repair ownership
- any user-facing command surface

## Guardrail proof

Phase 31 does not add:

- new persistence
- new HTTP routes
- new MCP tools
- new browser mutation paths
- new user-facing commands
- new trust-boundary exceptions

This is a presentation cleanup and selective quieting phase only.

## Next step

The intended next assistant-led target after this phase is:

- **Assistant-Led Phase 32: Review and Approval Ergonomics**

Phase 32 should improve the clarity and batching of human decision points now that the top surfaced-work views are calmer and less repetitive.
