# Assistant-Led Phase 16 Plan

## Title

Repair Outcome Tracking and Drift Prevention

## Summary

Phase 16 makes the Phase 15 repair flow accountable.

This phase adds:

- repair execution history in the local SQLite database
- automatic before-and-after recheck for safe repair runs
- shared last-repair and recurring-drift summaries across status, doctor, install check, health, desktop status, and console
- recurring prevention hints for wrapper drift, desktop drift, LaunchAgent drift, and secret-permission drift

This phase does not add:

- new HTTP routes
- new MCP tools
- browser-side repair execution
- autonomous background repair

## Delivered Shape

- record safe repair outcomes for:
  - `personal-ops repair run`
  - `personal-ops install wrappers`
  - `personal-ops install fix-permissions`
  - `personal-ops install launchagent`
  - `personal-ops install desktop`
- classify each recorded repair as:
  - `resolved`
  - `still_pending`
  - `failed`
- keep repair execution CLI-only while exposing richer read-only summaries everywhere else
- detect recurring drift over a 30-day window and attach fixed prevention guidance

## Acceptance

- safe repair execution records before/after repair state in SQLite
- repair run output says whether the targeted issue was actually resolved
- status, doctor, health, install check, and desktop status agree on the same last repair and recurring-drift summary
- console stays read-only and renders the additive repair memory safely
- no new trust boundary is widened
