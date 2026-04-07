# Assistant-Led Phase 14 Rollout

## What Shipped

Phase 14 adds a repairable wrapper path on top of the existing desktop support contract.

Key outcomes:

- wrapper provenance now records generation time, source commit, pinned Node executable, and wrapper targets
- `personal-ops install wrappers` refreshes CLI, daemon, and MCP wrappers without touching desktop app state, LaunchAgent setup, or secrets
- install check and doctor now distinguish wrapper drift from broader install failures
- desktop status now reports launcher repair separately from desktop reinstall
- desktop open now gives targeted repair guidance:
  - unsupported platform: macOS-only
  - stale launcher: reinstall wrappers
  - stale desktop app: reinstall desktop
  - missing desktop app on macOS: install desktop

## Verification

The phase was verified with:

- `npm run typecheck`
- `npm test`
- `npm run verify:desktop-platform`
- `npm run verify:desktop`
- `npm run verify:all`

## Trust Boundaries

Phase 14 keeps the existing assistant-led trust boundaries intact:

- desktop shell remains optional and macOS-only
- no new browser mutation authority was added
- no new HTTP or MCP APIs were added
- workflow ranking and core operator truth remain unchanged
