# Assistant-Led Phase 27 Rollout Record

## Summary

Phase 27 is complete and starts Cluster B in the assistant-led roadmap.

This phase makes workflow guidance feel more personally useful by favoring work that matches how the operator already tends to act, while keeping the behavior deterministic and bounded.

## What Changed

- added a derived `workflow_personalization` summary for workflow actions and surfaced workflow items
- used existing planning-recommendation history only:
  - no new saved preferences
  - no new persistence
- kept personalization workflow-first:
  - `now-next`
  - `prep-day`
  - assistant top action
  - console workflow and assistant views
- left core `worklist` ordering unchanged

## Examples

- a follow-up action can now be favored in the early day when historical follow-up work is usually handled then
- a task block can be held back in the early day when the operator usually acts on task scheduling later in the day
- a category with weak or mixed history stays neutral and does not get stronger timing language
- personalization disappears when the system is not ready or when the current time is outside the configured workday

## Guardrails Preserved

- no new HTTP or MCP surfaces were added
- no browser execution path was added
- no new persistence layer was added
- no new commands were added
- no core worklist reordering was introduced
- active repair and urgent concrete work still stay ahead of personalized workflow emphasis
