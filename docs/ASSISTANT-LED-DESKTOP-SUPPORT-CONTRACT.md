# Assistant-Led Desktop Support Contract

## Supported Platform

The assistant-led desktop shell is supported on macOS only in the current program.

This is an explicit product contract, not an accidental limitation.

## What Ships

The supported desktop path is:

- a macOS Tauri app bundle at `~/Applications/Personal Ops.app`
- the existing local daemon, HTTP API, and console UI inside a native webview
- LaunchAgent-managed background service behavior
- local install, open, and status commands through:
  - `personal-ops install desktop`
  - `personal-ops desktop open`
  - `personal-ops desktop status`

## What Does Not Ship In This Contract

This phase does not make Linux or Windows a supported desktop target.

The repo may still contain transitive desktop dependencies that appear in cross-platform Tauri/Wry lockfiles. In particular, Linux GTK3/WebKit-related crates can appear through the upstream desktop stack even though they are not part of the supported macOS desktop path in this repo.

Those unsupported-platform transitive findings should not be treated as equivalent to a supported-path macOS desktop security issue.

## Actionable Desktop Security Issues

Treat the following as actionable for this repo:

- desktop `npm audit` findings that affect the shipped desktop frontend toolchain
- Rust advisories that affect the supported macOS desktop path
- stale installed desktop builds whose provenance no longer matches the current checkout

Treat the following as unsupported-platform informational noise for this phase:

- Linux GTK3/WebKit transitive findings that arise from the upstream Tauri/Wry Linux stack and are not part of the supported macOS desktop ship path

## Operator Commands

Use these commands for desktop maintenance:

- `personal-ops desktop status`
- `personal-ops install desktop`
- `personal-ops install check`
- `npm run verify:desktop-platform`
- `npm run verify:desktop`
- `npm run verify:all`

## Closeout Rule

Any future desktop maintenance change should preserve this contract unless a later roadmap phase explicitly changes the supported platform scope.
