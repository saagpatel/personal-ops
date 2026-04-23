# Assistant-Led Phase 37 Plan

Date: 2026-04-14
Status: Complete

## Goal

Simplify verification and current-truth documentation by making ownership explicit, then removing overlapping responsibility that no longer adds confidence.

This phase is not a product redesign phase.

## Starting Point

Phases 35 and 36 already stabilized:

- prepared-handoff semantics
- current-truth roadmap routing
- the stronger closeout contract for future phases

The remaining problem was ownership drift:

- `verify:full` still duplicated restore behavior that should live in `verify:recovery`
- `verify:console` still carried browser assertions that duplicated deterministic semantics
- `release.test.ts` and `hardening.test.ts` still overlapped on workflow expectations
- `docs-navigation.test.ts` still carried legacy history inventory instead of a narrower current-truth contract

## Ownership Matrix

Phase 37 uses this ownership model:

| Artifact | Owns | Does not own |
| --- | --- | --- |
| `npm test` | deterministic product semantics and governance contracts | browser-only console proof |
| `verify:smoke` | cheap install, wrapper, daemon, HTTP, MCP, and snapshot-create sanity | restore, prune, browser-console journeys |
| `verify:full` | broader installed-product CLI and backup-inspect sanity | restore, prune, rehearsal, browser-console semantics |
| `verify:recovery` | restore, rescue snapshot, prune, and rehearsal behavior | generic CLI/status sanity |
| `verify:console` | narrow browser-critical console journeys | prepared-handoff semantics already owned by deterministic tests |
| `hardening.test.ts` | script and workflow topology | release script semantics |
| `release.test.ts` | release-prep and release-notes behavior | workflow topology |
| `docs-navigation.test.ts` | current-truth routing and artifact-role hierarchy | historical rollout inventory |

## Frozen Boundaries

Phase 37 must not change:

- `assertAuthorized`
- `assertOriginAllowed`
- local-request assumptions
- browser-session role restrictions
- `CONSOLE_SESSION_COOKIE`
- session grant or TTL behavior
- `isConsoleBrowserRoute`
- browser-safe route-method scope
- `ROOT_CONSOLE_JS_ASSETS`
- root console asset exposure
- `/console/*.js` resolution behavior
- browser-visible payload shape
- browser-visible identifiers or provenance
- CLI-only authority posture
- send / approval / auth-mutation / restore / destructive authority boundaries

## Verification Plan

Required local verification before merge:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Additional targeted checks should run after verifier cleanup when ownership moves between `verify:full`, `verify:recovery`, and `verify:console`.

## Closeout Contract

Phase 37 should:

- review everything it built
- remove checks, wording, and scaffolding that no longer have a unique owner
- write `docs/ASSISTANT-LED-PHASE-37-ROLLOUT.md`
- update `docs/ASSISTANT-LED-ROADMAP.md`
- refresh onboarding wording so current readers stop at Phase 37 complete and Phase 38 next

Phase 37 does not require a separate audit doc because it is an ownership-cleanup phase, not an audit-first contradiction phase.
