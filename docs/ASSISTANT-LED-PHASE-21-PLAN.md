# Assistant-Led Phase 21: Maintenance Escalation and Queue Promotion

## Summary

Phase 21 continues the assistant-led maintenance track and intentionally does not reuse the repo's older legacy `Phase 21` governance-cleanup work.

This phase adds one bounded queue-visible cue when the same maintenance family repeatedly turns into active repair:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no background execution
- no new persistence layer
- no new maintenance commands
- no planning recommendations or task creation

The implementation stays derived-only and keeps maintenance behind active repair and urgent concrete operator work.

## Delivered Shape

- a derived `maintenance_escalation` summary layered onto the existing maintenance follow-through and repair-plan model
- promotion limited to repeated `handed_off_to_repair` patterns for safe maintenance families only
- additive escalation summaries across:
  - `status`
  - `worklist`
  - `now`
  - `workflow prep-day`
  - `repair plan`
  - `maintenance session`
  - console repair and maintenance views
- one bounded derived worklist cue:
  - `AttentionItem.kind = "maintenance_escalation"`
  - severity `warn`
  - command `personal-ops maintenance session`

## Guardrails Preserved

- ordinary `stale_bundle` pressure does not promote into the queue
- deferred calm-window maintenance does not promote into the queue by itself
- active repair for the same family suppresses the escalation cue
- a recent successful maintenance run suppresses false escalation
- no new write surface was added
- browser and console remain read-only

## Verification

Phase 21 is complete only when all of these pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`
