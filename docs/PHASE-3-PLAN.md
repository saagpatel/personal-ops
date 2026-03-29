# Phase 3 Plan: End-To-End Confidence Checks

## Summary

Phase 3 turns the existing strong unit and integration coverage into a product-verification layer. The goal is to prove that `personal-ops` works as an installed stack, not just as internal code paths.

Defaults for this phase:

- delivery shape: both local-useful and future-CI-ready
- verification depth: two-tier
- default verification does not depend on live Gmail or Google Calendar access
- full-stack verification uses isolated temp-home state instead of the operator's real home directory
- LaunchAgent verification is included in the deeper path and treated as macOS-local rather than a hard CI requirement

Phase 3 must not widen assistant permissions, change HTTP or MCP contracts, alter audit or governance boundaries, or introduce schema churn.

## Public Interfaces

Add these repo-facing verification entrypoints:

- `npm run verify:smoke`
  - fast, isolated, CI-friendly default
  - verifies build output, temp-home setup, wrapper generation, daemon boot, core HTTP reads, core MCP reads, and snapshot creation without live provider auth
- `npm run verify:full`
  - deeper local full-stack pass
  - verifies temp-home bootstrap, wrapper install, LaunchAgent setup on macOS, daemon boot via generated wrapper, CLI reads, HTTP smoke, MCP smoke, backup create and inspect, restore recovery, and post-restore daemon boot
- `npm run verify:launchagent`
  - small focused macOS-local check for generated plist, launchctl load, and idempotent reload behavior

No new HTTP endpoints or new MCP tools should be added for this phase.

## Implementation Shape

### Reusable isolated-environment harness

Create a shared verification harness that can:

- create a temp-home environment
- point `PERSONAL_OPS_APP_DIR` at the checked-out repo app directory
- seed placeholder config, policy, OAuth placeholder, and tokens through the existing runtime logic
- force an isolated service port so verification never collides with the real daemon
- start and stop the daemon safely
- talk to the local HTTP API and MCP stdio bridge
- capture startup stderr and logs for failure diagnostics

### Smoke suite

The smoke suite should verify:

- built entrypoints exist and run
- temp-home runtime files can be initialized
- install wrappers can be generated without touching the operator's real home
- daemon boot works in the isolated temp-home
- HTTP reads succeed for:
  - `/v1/status`
  - `/v1/worklist`
  - `/v1/doctor`
- MCP stdio works for:
  - tool listing
  - `personal_ops_status`
  - one inbox-style read such as `inbox_status`
- snapshot create and inspect work end to end

### Full suite

The full suite should extend smoke with:

- `./bootstrap` in temp-home
- wrapper existence, executability, and target validation
- `install check` validation in temp-home
- LaunchAgent load and target verification on macOS
- daemon boot through the generated daemon wrapper
- CLI read checks for:
  - `status`
  - `worklist`
  - `doctor`
- MCP verification through the generated MCP wrapper
- snapshot create and inspect through CLI
- fixture-backed state mutation and restore recovery
- rescue snapshot verification during restore
- post-restore daemon boot confirmation

### Recovery fixtures

Use fixture-backed local DB state with:

- one task
- one task suggestion
- one planning recommendation
- one post-snapshot mutation that should disappear after restore

The restore path should also verify opt-in config and policy restore without touching tokens or provider secrets.

### Failure diagnostics

When verification fails, print:

- which phase failed
- the temp-home path
- the failing command or endpoint when available
- recent daemon stdout and stderr
- MCP stderr when applicable

## Verification Required To Close Phase 3

Phase 3 is complete only if all of the following pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`

Recommended additional local check:

- `npm run verify:launchagent`

## Future-Phase Setup

Phase 3 should explicitly prepare later work:

- Phase 4 can improve operator UX around a tested installed stack instead of guessed flows
- Phase 5 can document concrete verification commands instead of aspirational ones
- Phase 6 can extend install and auth diagnostics on top of the new isolated harness
- Phase 7 can use the temp-home verification pattern when clarifying machine ownership and restore semantics
- Phase 8 can rely on preserved HTTP and MCP contracts that are now exercised end to end
