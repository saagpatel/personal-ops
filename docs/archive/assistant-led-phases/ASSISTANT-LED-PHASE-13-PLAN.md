# Assistant-Led Phase 13 Plan

## Summary

Phase 13 hardens the current desktop support contract instead of widening platform scope.

The desktop shell remains optional and explicitly macOS-only, but its status, install guidance, and verification now make that contract durable and easier to maintain.

## Delivered

- explicit desktop support contract surfaced through desktop status and install reporting
- desktop build provenance with:
  - built time
  - source commit
  - Vite version
  - Tauri CLI version
  - Tauri runtime version
- stale-install detection and reinstall guidance for desktop builds that no longer match the current checkout
- dedicated desktop dependency verification through `npm run verify:desktop-platform`
- executable policy that treats unsupported Linux GTK3/WebKit transitive findings as informational noise for this macOS-only phase
- richer `personal-ops desktop status` and `personal-ops install check` output without adding new HTTP, MCP, or browser surfaces

## Hardening Rules

- desktop support contract is `macos_only`
- unsupported platforms must report a clear reason instead of looking broken
- missing desktop source checkout must be distinguished from an incomplete toolchain
- installed desktop apps with missing build provenance or an older source commit must recommend reinstall
- actionable desktop npm vulnerabilities fail verification
- actionable desktop Rust vulnerabilities fail verification
- unsupported Linux GTK3/WebKit transitive findings remain informational for this phase only

## Guardrails

- no new desktop product capability is added
- desktop shell stays optional
- LaunchAgent remains the startup and integration path
- no new browser mutation authority is introduced
- no send, approval, auth, restore, or ranking boundaries are widened

## Completion Standard

Phase 13 is complete when:

- desktop status exposes support contract, provenance, and reinstall guidance
- install check distinguishes macOS-only support, missing source, incomplete toolchain, and stale desktop installs
- desktop verification includes the dedicated platform/dependency gate
- the roadmap and desktop support docs match the implemented behavior
- verification passes:
  - `npm run typecheck`
  - `npm test`
  - `npm run verify:all`
