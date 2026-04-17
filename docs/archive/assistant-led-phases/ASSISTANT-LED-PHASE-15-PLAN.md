# Assistant-Led Phase 15 Plan

## Title

Guided Local Repair and Repair Plans

## Summary

Phase 15 turns the richer install, doctor, desktop, and recovery diagnostics into one deterministic local repair flow.

The focus of this phase is guided repair:

- one shared repair plan across status, doctor, health, install check, and desktop status
- narrow executable repair steps for wrappers, permissions, LaunchAgent, and desktop refresh
- manual-only guidance for deeper runtime, auth, and recovery actions
- no new browser mutation path, workflow ranking source, or cross-platform desktop expansion

## Delivered Shape

- add shared repair-plan types and precedence
- extend doctor, status, and health to carry the canonical repair plan
- add install and desktop repair-plan summaries
- add `personal-ops repair plan`
- add `personal-ops repair run <stepId|next>` for the small safe subset of executable repairs
- render the repair plan read-only in the console
- update roadmap and desktop support guidance

## Guardrails

- no automatic background self-healing
- repair execution stays CLI-only
- browser and console remain read-only for repair
- no new HTTP or MCP APIs
- no change to send, approval, auth, restore, or ranking behavior
