# Assistant-Led Phase 6 Plan

## Goal

Turn planning recommendations into prepared execution bundles so the operator reviews and applies grouped work instead of translating raw recommendations by hand.

## Scope

Phase 6 adds:

- `personal-ops planning autopilot`
- read and detail HTTP routes for planning bundles
- bundle preparation and grouped apply for:
  - `task_block`
  - `thread_followup`
  - `event_prep`
- bundle reuse of inbox autopilot groups and meeting prep packets where available
- console-first planning review with prepared note, execution preview, and linked artifacts
- browser-safe operator apply for reviewed bundles with explicit confirmation and note

## Guardrails

- ranking stays deterministic
- bundles may auto-prepare when the system is healthy
- bundles never auto-apply
- grouped apply stays operator-only
- grouped apply requires confirmation
- grouped apply requires a note
- grouped apply is audit-logged
- send, approval decisions, auth, restore, and destructive actions remain gated

## Success Target

The operator should be able to:

- open the console and see a small number of prepared planning bundles
- inspect the grouped recommendation members and execution preview
- reuse staged inbox and meeting prep work instead of rebuilding it
- apply the whole reviewed bundle from the console without silently mutating anything
