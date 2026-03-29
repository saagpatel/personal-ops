# Assistant-Led Phase 4 Plan

## Summary

Phase 4 makes the assistant-led console feel easier to keep nearby by wrapping it in a lightweight native macOS shell.

The goal is not a second product or a native rewrite. The goal is a simpler daily home for the same daemon, the same console UI, and the same trust boundaries.

## Deliverables

- a Tauri-based desktop shell under `desktop/`
- operator-only console-session handoff through `POST /v1/console/session`
- optional local install flow with `personal-ops install desktop`
- native open and status commands with `personal-ops desktop open` and `personal-ops desktop status`
- tray or menu bar visibility for readiness, now-next, and session refresh
- bounded native notifications for high-signal operator cues
- durable Phase 4 docs and roadmap memory

## Public Additions

CLI:

- `personal-ops install desktop`
- `personal-ops desktop open`
- `personal-ops desktop status`

HTTP:

- `POST /v1/console/session`

Verification:

- `npm run verify:desktop`

## Desktop Shape

The shell should:

- load the existing console UI in a native webview
- request a fresh console session from the daemon
- recover from locked or expired console state by refreshing that session
- surface compact readiness and now-next context in the tray or menu bar
- stay optional and local-only

## Guardrails

- same daemon
- same local HTTP API
- same console sections
- same trust boundaries
- no send, approval decisions, restore, auth mutation, or destructive actions added to the desktop shell
- no signed distribution, notarization, or auto-update in this phase

## Install Model

Phase 4 keeps the project source-first.

The desktop shell is:

- macOS only in this phase
- built locally from source
- installed as an unsigned app bundle at `~/Applications/Personal Ops.app`
- optional instead of required for bootstrap or normal CLI use

## Verification

Phase 4 keeps the standard verification stack:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:desktop`
- `npm run verify:all`

Additional focus:

- operator-only console session creation
- desktop install, open, and status flows
- session refresh after console lock or expiry
- tray or menu bar readiness plus now-next rendering
- bounded desktop notifications
- unchanged gating for high-trust actions
