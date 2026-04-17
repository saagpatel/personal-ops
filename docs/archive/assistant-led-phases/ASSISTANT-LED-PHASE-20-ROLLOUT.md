# Assistant-Led Phase 20: Maintenance Follow-Through and Bundle Outcomes

## Rollout Summary

Phase 20 is now implemented.

The system can now explain:

- whether the last maintenance session completed cleanly
- whether it only advanced one step in a larger calm-window bundle
- whether it stopped and handed off to repair for the right reason
- whether the same maintenance bundle keeps resurfacing without a recent successful run

## Examples Captured in Product Behavior

### Completed and then quiet

When the last `maintenance_run` resolved its target and no calm-window steps remained, Phase 20 reports the bundle as completed and keeps maintenance pressure quiet.

### Advanced through multiple calm-window steps

When one maintenance step resolves and another calm-window step still remains, the session now reports that it advanced and shows that more maintenance work is still available.

### Handed off to repair

When a maintenance step resolves but active repair becomes pending immediately afterward, the session now reports that it stopped for the right reason and handed back to the repair plan.

### Recurring resurfacing bundle

When the same maintenance step keeps returning across calm windows without a recent successful maintenance run, the system now surfaces maintenance pressure and recommends starting the maintenance session during the next calm window.

## Trust Boundary Check

Phase 20 preserved the existing guardrails:

- no new HTTP routes
- no new MCP tools
- no browser execution path
- no new repair or maintenance write surface
- no new persistence layer

All follow-through signals are derived from the existing maintenance session state and existing `repair_executions` history.
