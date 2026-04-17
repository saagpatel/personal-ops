# Phase 1 Rollout

## Title

Phase 1: Install Like a Product

## Goal

Make `personal-ops` easier to install, operate, repair, and recover on a new machine without changing the existing trust model or widening assistant permissions.

## Scope Delivered

Phase 1 delivered a product-style operator install and recovery layer around the existing stable core:

- root `./bootstrap` for the fresh-clone golden path
- local `install all` command for wrappers and LaunchAgent setup
- local `install check` readiness report that does not require the daemon
- generated CLI, daemon, Codex MCP, and Claude MCP wrappers managed from code
- generated LaunchAgent plist managed from code
- same-machine `backup restore <snapshotId> --yes` flow with rescue snapshot behavior
- updated onboarding docs that make bootstrap the primary path

## What Changed

### Bootstrap and install

- Added `./bootstrap` as the primary new-machine flow.
- Added local install commands that do not depend on the daemon already running.
- Made wrapper and LaunchAgent setup idempotent so the install path can be re-run safely.

### Runtime readiness

- Added a stronger install-check report for runtime files, OAuth inputs, wrapper targets, and LaunchAgent state.
- Updated doctor behavior to recognize wrapper-based LaunchAgent installs as the supported default shape.

### Backup and restore

- Kept snapshot create, list, and inspect behavior.
- Added cautious same-machine restore with:
  - explicit confirmation
  - rescue snapshot first
  - optional config restore
  - optional policy restore
  - no token or Keychain restore

## What Stayed Stable

- HTTP contract
- MCP contract
- schema version `14`
- ranking version `phase12-v1`
- audit and governance boundaries
- assistant-safe audit categories and inputs
- operator-only mutation boundaries

## Verification Summary

Phase 1 was verified successfully before Phase 2 began:

- `npm run typecheck` passed
- `npm test` passed with all tests green
- temp-home bootstrap rehearsal succeeded and ended in the expected setup-required state on blank auth inputs
- `personal-ops install check` passed on the real machine
- `personal-ops status` passed
- `personal-ops worklist` passed
- `personal-ops backup create` passed
- `personal-ops doctor --deep` passed with one acceptable transient inbox-sync warning during live mailbox refresh

## Follow-On Recommendation

Proceed to Phase 2 next:

- preserve the roadmap in repo docs
- split the giant core files into stable domain modules
- keep behavior stable so Phase 3 can add full-stack confidence checks on top of a cleaner codebase
