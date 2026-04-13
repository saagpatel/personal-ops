# Assistant-Led Phase 31 Plan

Status: Complete

## Intent

Phase 31 is the assistant-led cross-surface noise-reduction phase, not the repo's older legacy `PHASE-31-*` governance work.

The goal is to make the workspace calmer by reducing repeated low-value cues across the existing top surfaced-work views without changing ranking, authority, or ownership.

## Defaults

- roadmap preservation happens first
- balanced posture:
  - deduplicate repeated workspace, assistant, and workflow wording
  - quiet weak or mixed secondary cues
  - keep the primary focus fully visible
- scope stays limited to:
  - `workspace_home`
  - top assistant action
  - top `now-next`
  - console overview and desktop wrapper views that compose those same signals
- no new persistence beyond Phase 30
- no new HTTP or MCP routes
- no new browser mutation paths
- no new commands
- no ranking, precedence, or ownership changes

## Planned implementation

### 1. Shared surfaced-noise read model

Add a derived read-model summary that decides whether a surfaced item is:

- `primary`
- `supporting`
- `quieted`
- `suppressed_duplicate`

The summary should include:

- the surface
- stable target identity when available
- the disposition
- the reason
- the copy shown to the operator
- whether helpfulness, why-now text, and workflow-personalization text should still render

This layer is derived only and should not persist anything.

### 2. Identity-aware duplicate reduction

Use one stable identity comparison:

- matching `target_type + target_id`
- assistant/workspace match on `assistant_action_id` when available
- workflow/workspace match on `planning_recommendation_id` when available

Do not deduplicate by guesswork when identity is unstable.

### 3. Balanced quieting behavior

Apply these rules:

- never quiet or suppress the primary workspace focus
- never suppress the only actionable surfaced item
- exact duplicates of the primary focus become referential secondary items
- weak secondary surfaced work can be quieted when a clearer primary focus exists
- mixed secondary surfaced work can be quieted when a clearer primary focus exists
- unproven surfaced work stays visible in this phase
- helpful surfaced work stays visible unless it is an exact duplicate of the primary focus

### 4. Surface cleanup

Update only these surfaces:

- `personal-ops status`
- `personal-ops console`
- the console-backed desktop shell
- top assistant action payloads
- `personal-ops workflow now-next`

Keep commands available even when copy is quieter.

Do not change:

- `worklist` ordering
- `compareAttentionItems()`
- workflow ranking
- workflow personalization scoring
- maintenance or repair ownership

### 5. Docs and closeout

Before PR creation:

- add `docs/ASSISTANT-LED-PHASE-31-ROLLOUT.md`
- update the roadmap again so Phase 31 is marked complete
- name the next assistant-led target

Phase closeout must include:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
- branch, commit, PR, merge, post-merge CI wait, local-main sync, and branch cleanup

## Test expectations

Add direct coverage for:

- duplicate assistant/workspace focus identity
- duplicate workflow/workspace focus identity
- quieted weak secondary cues
- quieted mixed secondary cues
- helpful and unproven cues staying visible
- status keeping surfaced proof only for workspace focus
- console and desktop wrapper showing one primary story with quieter secondary copies
- commands remaining available even when wording is quieter
- no ranking or precedence regressions

## Next phase

The next assistant-led target after this phase is:

- **Assistant-Led Phase 32: Review and Approval Ergonomics**
