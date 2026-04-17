# Assistant-Led Phase 13 Rollout

## Summary

Phase 13 is complete.

This phase makes the desktop support story explicit: the shell is still a useful native wrapper, but it is a macOS-only path with durable install guidance, build provenance, and a verification policy that matches what the repo actually ships.

## Delivered

- explicit `macos_only` desktop support contract in status and install reporting
- persisted desktop build provenance for:
  - built time
  - source commit
  - Vite version
  - Tauri CLI version
  - Tauri runtime version
- reinstall recommendations when an installed app is stale relative to the current checkout
- `npm run verify:desktop-platform` as a dedicated dependency posture gate
- desktop verification that:
  - fails on actionable desktop npm vulnerabilities
  - fails on actionable supported-path Rust advisories
  - treats unsupported Linux GTK3/WebKit transitive findings as informational noise for this macOS-only phase
- durable desktop support guidance in `docs/ASSISTANT-LED-DESKTOP-SUPPORT-CONTRACT.md`

## Trust Boundaries

Phase 13 keeps the assistant-led trust model intact:

- no new desktop write surface was introduced
- no new browser mutation authority was introduced
- LaunchAgent remains the desktop startup path
- no send, approval, auth, restore, or destructive control widened
- no desktop signal enters the core workflow ranking engine

## Verification

Verified during implementation:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Phase-specific coverage includes:

- macOS-only contract reporting
- stale desktop reinstall guidance
- build provenance persistence and round-trip status reporting
- desktop platform verification policy for npm and Rust audit output
- unchanged desktop install/open behavior on the supported macOS path

## Completed Work Review

Phase 4 introduced the desktop shell.

Phase 13 makes that shell operationally clearer:

- the operator can now tell whether the machine is supported, whether the app is current, and whether reinstall is recommended
- install check now explains desktop platform state without implying unsupported machines are broken
- desktop dependency cleanup is now policy-driven instead of ad hoc
- future maintenance can distinguish real supported-path security issues from unsupported-platform transitive noise

Program-level result:

- the desktop shell stays optional
- the macOS support contract is now explicit
- desktop maintenance should produce fewer ambiguous alerts and less repeated triage
