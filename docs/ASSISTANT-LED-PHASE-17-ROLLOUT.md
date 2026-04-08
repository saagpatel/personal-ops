# Assistant-Led Phase 17 Rollout

## Summary

Phase 17 is the preventive-maintenance layer on top of Phase 16 repair memory.

The operator can now see:

- when a safe repair has repeated often enough to justify earlier maintenance guidance
- which recurring issue is the top preventive recommendation right now
- when an active repair should suppress duplicate preventive noise
- when a fresh repair is still inside the quiet period and should not immediately nag again

## What Changed

- `RepairPlan` now derives preventive-maintenance recommendations from repeated resolved safe repairs
- status, doctor, health, install check, desktop status, repair plan output, and console all expose the same preventive summary
- `personal-ops repair run <stepId|next>` now adds a short preventive follow-up note when a resolved safe repair has become a repeat pattern
- preventive recommendations stay separate from the pending repair-step list and remain CLI-guided only

## Example Outcomes

- healthy but recurring wrapper drift:
  - repeated resolved wrapper repairs now produce a preventive wrapper refresh recommendation even when wrapper repair is not currently pending
- active repair suppression:
  - if wrapper drift is currently pending again, the system keeps it in the repair steps section and suppresses duplicate preventive wrapper guidance
- quiet-period suppression:
  - if a safe repair was just resolved within the last 24 hours, preventive maintenance stays quiet until that cooling-off window passes

## Guardrails Preserved

- no new write surface was added
- repair execution remains CLI-only
- browser and console remain read-only for repair and preventive guidance
- no new HTTP routes were added
- no new MCP surface was added
- no change was made to send, approval, auth, restore, or ranking boundaries
