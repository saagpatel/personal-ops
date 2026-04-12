# Assistant-Led Phase 21: Maintenance Escalation and Queue Promotion

## Rollout Summary

Phase 21 is now implemented.

The system now promotes one narrow maintenance pattern into the queue:

- repeated `maintenance_run` outcomes for the same safe maintenance family
- the maintenance step resolves
- active repair immediately appears afterward
- the same family has not had a recent successful maintenance run

When that pattern repeats, the product stops treating it like quiet calm-window upkeep and shows one bounded operational cue tied to `personal-ops maintenance session`.

## Examples Captured in Product Behavior

### Recurring handoff now creates a queue cue

When the same safe maintenance family repeatedly resolves and then immediately hands off into repair, Phase 21 emits one `maintenance_escalation` cue with severity `warn`.

### Active repair suppresses duplicate escalation

If that same family is already pending in the active repair plan, the escalation cue disappears and the repair plan remains the only source of truth.

### Recent successful maintenance suppresses false escalation

If the operator completed a successful maintenance run for that same family in the last 7 days, the escalation cue stays quiet even when older handoff history exists.

## Queue Positioning

Phase 21 keeps the queue honest without creating a second workflow system:

- never ahead of critical repair
- never ahead of urgent concrete work such as due tasks, inbox pressure, calendar conflicts, or failing PR checks
- above quiet maintenance-window guidance and quiet governance noise

## Trust Boundary Check

Phase 21 preserved the assistant-led maintenance guardrails:

- no new HTTP routes
- no new MCP tools
- no new browser execution path
- no new persistence layer
- no new maintenance commands
- no planning-recommendation or task creation path
