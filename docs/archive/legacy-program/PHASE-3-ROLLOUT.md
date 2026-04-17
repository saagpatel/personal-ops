# Phase 3 Rollout: End-To-End Confidence Checks

## Summary

Phase 3 adds a product-verification layer on top of the stable Phase 1 and Phase 2 baseline. It exercises the installed stack in isolated temp-home environments instead of relying only on unit or service-level checks.

## What Changed

- added repo-facing verification commands:
  - `npm run verify:smoke`
  - `npm run verify:full`
  - `npm run verify:launchagent`
- added a reusable verification harness for:
  - isolated temp-home setup
  - wrapper generation
  - daemon boot and shutdown
  - HTTP smoke reads
  - MCP stdio smoke reads
  - snapshot create and inspect
  - fixture-backed restore recovery
- strengthened LaunchAgent generation so explicit runtime paths are passed through the generated plist environment instead of relying on implicit launchd inheritance
- added a dynamic LaunchAgent label override path for isolated verification runs so temp-home checks do not collide with the real operator LaunchAgent
- added an explicit `PersonalOpsDb.close()` path and updated the verification harness to close temp DB handles deterministically
- fixed restore to clear SQLite sidecar files before swapping the live database so full recovery no longer replays stale WAL state
- preserved existing HTTP, MCP, audit, governance, and schema contracts

## Smoke Coverage

The smoke suite covers:

- temp-home runtime initialization
- wrapper generation in isolation
- daemon boot through generated wrappers
- HTTP smoke reads for status, worklist, and doctor
- MCP tool listing and representative safe reads
- snapshot create and inspect

## Full Coverage

The full suite covers:

- temp-home `./bootstrap`
- generated wrapper validation
- temp-home `install check`
- macOS LaunchAgent load and target verification
- daemon boot through the generated daemon wrapper
- CLI reads for status, worklist, and doctor
- HTTP smoke reads
- MCP smoke reads through the generated MCP wrapper
- fixture-backed snapshot, mutation, restore, rescue snapshot, and post-restore daemon boot

## Verification

Commands run and results:

- `npm run typecheck`: passed
- `npm test`: passed (`92/92`)
- `npm run verify:smoke`: passed
- `npm run verify:full`: passed
- `npm run verify:launchagent`: passed
- `personal-ops install check --json`: passed, `ready`, `23 pass / 0 warn / 0 fail`
- `personal-ops status --json`: passed, `ready`
- `personal-ops worklist --json`: passed, `ready`
- `personal-ops doctor --deep --json`: passed, `ready`, `42 pass / 0 warn / 0 fail`
- `personal-ops backup create --json`: passed, created snapshot `2026-03-29T06-36-06Z`

## Verification Notes

- the first full-stack restore rehearsal exposed a real restore bug: stale SQLite sidecar files could survive restore and replay post-snapshot mutations
- Phase 3 fixed that bug by clearing `-wal`, `-shm`, and `-journal` sidecars before swapping in the restored DB
- the focused LaunchAgent verification uses a temporary label plus explicit plist environment variables so temp-home verification stays isolated from the real installed agent

## Acceptable Caveats

- `verify:launchagent` is macOS-local and is not intended to be a hard requirement for non-macOS environments
- smoke and full verification remain intentionally offline-friendly and do not require live Gmail or Calendar auth

## Deferred

- live-provider verification still belongs to `personal-ops doctor --deep`
- broader multi-machine verification remains future work for Phase 7

## Recommended Next Phase

Phase 4 should follow next so daily operator UX, diagnostics, and human-readable guidance improve on top of a now-tested installed product stack.
