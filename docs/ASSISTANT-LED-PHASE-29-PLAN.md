# Assistant-Led Phase 29: Console and Desktop Workspace Maturity

## Summary

Phase 29 closes Cluster B by making the console and optional macOS desktop shell feel like one calm daily home instead of a collection of adjacent smart panels.

Chosen defaults:

- this is the assistant-led Phase 29, separate from the repo's older legacy `Phase 29` governance work
- the work stays console-first; the desktop shell remains a native wrapper around the same console, not a second product
- no new HTTP routes, MCP tools, browser mutation paths, maintenance commands, SQLite tables, or persistence
- no changes to core queue ownership, `compareAttentionItems()`, repair-first precedence, or trust boundaries
- Phase 29 is the Cluster B closeout and merge point for Phases 27-29

## Delivered shape

- add one shared `workspace_home` summary to the status model
- derive one primary daily focus from existing repair, assistant, workflow, and maintenance signals only
- support these workspace-home states:
  - `repair`
  - `assistant`
  - `workflow`
  - `maintenance`
  - `caught_up`
- keep the primary commands unchanged:
  - `personal-ops repair plan`
  - existing assistant action command when assistant-owned
  - existing `now-next` command when workflow-owned
  - `personal-ops maintenance session` when upkeep-owned

## Surface rules

- the console overview leads with one `Workspace focus` card instead of making the user reconcile multiple competing top summaries
- `personal-ops status` shows one compact workspace-focus summary
- assistant, workflow, and maintenance previews stay actionable, but repeated "why now" prose is collapsed when it matches the top workspace story
- when repair owns the workspace, assistant and workflow previews become referential rather than competing imperative copy
- the desktop shell inherits the same overview story through the shared console payload

## Guardrails

- no new persistence
- no new execution path
- no new commands
- no new queue kinds
- no change to `compareAttentionItems()`
- no change to repair-first or urgent-work-first precedence
- no change to the macOS-only desktop support contract

## Cluster note

Phase 29 closes Cluster B.

- Phase 27: Queue Personalization Without Unsafe Autonomy
- Phase 28: Repair and Maintenance Convergence
- Phase 29: Console and Desktop Workspace Maturity

Cluster B should merge once Phase 29 verification is green.
