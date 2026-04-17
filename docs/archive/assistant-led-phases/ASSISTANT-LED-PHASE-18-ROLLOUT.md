# Assistant-Led Phase 18 Rollout

## Summary

Phase 18 is the calm-window maintenance layer on top of Phase 17 preventive guidance.

The operator can now see:

- when the machine is healthy enough for a small preventive-maintenance bundle
- which safe maintenance commands belong together in that calm window
- when real work or active repair should suppress the bundle
- the same maintenance-window summary across worklist, now, prep-day, status payloads, and the console

## What Changed

- `RepairPlan` and shared status/worklist reports now carry a derived `maintenance_window` summary
- `personal-ops worklist` can show a `Preventive Maintenance` section when the queue is calm
- `personal-ops now` can add a short calm-window note without replacing the real next steps
- `personal-ops workflow prep-day` now includes a `Maintenance Window` section between time-sensitive work and next commands
- the console repair area now shows the same calm-window bundle read-only

## Example Outcomes

- healthy recurring wrapper drift:
  - repeated resolved wrapper repairs can now surface a calm-window wrapper refresh bundle when no urgent work is competing
- active repair suppression:
  - if wrapper drift becomes active again, the maintenance bundle disappears and the issue returns to the repair-plan section only
- concrete work suppression:
  - if a real task, follow-up, GitHub attention item, or calendar pressure is present, the maintenance bundle stays deferred instead of competing with that work
- quiet-period suppression:
  - a freshly resolved safe repair still stays quiet for 24 hours before it can join a maintenance window

## Guardrails Preserved

- no new write surface was added
- no new HTTP routes or MCP tools were added
- repair execution remains CLI-only
- browser and console remain read-only for maintenance guidance
- no change was made to send, approval, auth, restore, or ranking boundaries
