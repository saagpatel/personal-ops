# Assistant-Led Phase 27: Queue Personalization Without Unsafe Autonomy

## Summary

Phase 27 starts Cluster B with a workflow-first personalization layer.

This phase stays derived-only:

- no new HTTP routes
- no new MCP tools
- no browser mutation path
- no new maintenance commands
- no new SQLite tables or persistence

The implementation builds on:

- existing planning-recommendation history
- workflow candidate ranking
- readiness state
- configured workday hours

## Delivered Shape

- added a shared `workflow_personalization` summary for workflow-first ranking
- added descriptive personalization categories:
  - `task`
  - `followup`
  - `meeting`
- added descriptive preference windows:
  - `early_day`
  - `mid_day`
  - `late_day`
  - `anytime`
- added descriptive fit states:
  - `favored`
  - `neutral`
  - `defer`
- kept personalization bounded to:
  - `workflow now-next`
  - `workflow prep-day`
  - assistant top-action emphasis
  - console workflow and assistant views

## Guardrails Preserved

- this is the assistant-led Phase 27, not the older legacy `Phase 27` governance track
- core `worklist` ordering stays unchanged
- no new write path was added
- no self-modifying preference memory was added
- active repair and urgent concrete work still outrank personalized workflow emphasis

## Cluster B Start

- Phase 27 is the first slice of Cluster B
- later Cluster B phases should continue on the same branch theme:
  - Phase 28: repair and maintenance convergence
  - Phase 29: console and desktop workspace maturity
