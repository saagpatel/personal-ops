# Assistant-Led Phase 28 Rollout

## Intent

Phase 28 is the assistant-led convergence phase, not the repo's older legacy governance Phase 28.

The goal is simple:

- if a recurring maintenance family is already active repair, the product should say so clearly
- if recurring maintenance is behaving like early repair, the product should use stronger converged wording
- if the family is still ordinary upkeep, the maintenance session should stay the source of truth

## Scenarios

### 1. Repair-owned recurring family

When the same safe recurring family is already pending in the repair plan and maintenance context still exists for that family:

- convergence becomes `repair_owned`
- the primary command becomes `personal-ops repair plan`
- maintenance surfaces stop sounding like "start maintenance now"
- repair becomes the single owner

### 2. Repair-priority upkeep

When there is no active repair step yet, but the family keeps escalating, keeps handing off into repair, or has high/rising maintenance confidence:

- convergence becomes `repair_priority_upkeep`
- the primary command stays `personal-ops maintenance session`
- the wording shifts from passive upkeep to early-repair language

### 3. Quiet preventive upkeep

When the family is only present as calm-window or cooling preventive guidance:

- convergence becomes `quiet_preventive`
- the maintenance session remains the canonical command
- the language stays intentionally quiet

## Guardrail proof

Phase 28 does not add:

- new persistence
- new browser execution
- new commands
- new queue kinds
- new write surfaces

It is a derived read-model layer only.

## Cluster status

Cluster B is still open after this phase.

- Phase 27 is implemented
- Phase 28 is implemented
- Phase 29 remains the closeout phase before merge
