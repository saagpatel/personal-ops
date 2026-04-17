# Assistant-Led Phase 26 Rollout Record

## Summary

Phase 26 is complete and closes Cluster A in the assistant-led maintenance track.

This phase adds one shared maintenance-decision explanation layer so maintenance guidance now explains, in plain language, why it belongs in the current block, later today, only in a calm window, or nowhere yet.

## What Changed

- added a derived `maintenance_decision_explanation` summary for the top maintenance family
- kept explanation fully descriptive instead of stateful:
  - `do_now`
  - `budget_today`
  - `calm_window`
  - `suppressed`
- kept explanation drivers bounded and deterministic:
  - `commitment`
  - `escalation`
  - `confidence`
  - `operating_block`
  - `scheduling`
  - `repair_blocked`
  - `readiness_blocked`
- surfaced the same explanation summary through:
  - `status`
  - `worklist`
  - `now-next`
  - `prep-day`
  - `repair plan`
  - `maintenance session`
  - console repair and maintenance views

## Examples

- maintenance in the current operating block now explains plainly why it belongs there now and why it still stays below active repair
- maintenance budgeted for later today now explains why it should happen today without becoming the immediate next move
- calm-window maintenance now explains why it stays quieter than scheduled or escalated upkeep
- suppressed maintenance now explains whether it is blocked by active repair, readiness, or lack of a valid operating block

## Guardrails Preserved

- no new HTTP or MCP surfaces were added
- no browser execution path was added
- no new persistence layer was added
- no new maintenance commands were added
- no new queue kind was added
- active repair and urgent concrete work still stay ahead of maintenance

## Cluster A Closeout

- this phase is the cluster closeout point for Phases 24, 25, and 26
- closeout requires one final full verification pass and one PR/merge for the whole cluster
