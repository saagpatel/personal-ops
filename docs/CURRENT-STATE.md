# Current State

Date: 2026-04-23
Status: Stable baseline after audit fixes and runtime repair

This note captures the repo state after the April 2026 audit, stabilization, documentation cleanup pass, Operator Home Phase 1, and the follow-up audit fixes on `codex/personal-ops-audit-fixes`.

## What changed recently

### Cleanup and stabilization pass

- fixed a real CLI regression where `inbox` was being registered twice
- made `app` builds start from a clean `dist/` so stale compiled artifacts no longer pollute test runs
- moved older phase-by-phase planning artifacts into `docs/archive/` to reduce top-level doc clutter
- refreshed the current-truth docs so the active baseline is easier to resume from

### Operator Home Phase 1

- added a dedicated operator-home seam under `app/src/service/operator-home.ts`
- extended `workspace_home` into a richer operator surface with sectioned content
- added `focus`, `day_start`, and `decisions` modes for shaping the home summary
- introduced provenance, freshness, and confidence metadata on top-level home items
- aligned console and CLI/status formatting around the same operator-home story

### Audit fix pass

- refreshed wrappers and the optional desktop app so install checks match the current checkout
- re-authenticated Gmail and Google grants for the configured mailbox
- created a fresh recovery snapshot after auth repair
- added a bridge-db dependency seam so tests can avoid writing to the live bridge database
- updated the Hono override to the fixed advisory range
- replaced the stale root `Makefile` pnpm workflow with npm-backed app commands
- archived the terminal Phase 37 and Phase 38 artifacts under `docs/archive/assistant-led-phases/`

## Current repo posture

`personal-ops` is currently in a strong maintenance-and-iteration state:

- the assistant-led delivery track is complete through Phase 38
- Operator Home Phase 1 is merged on top of that stable baseline
- the repo keeps a stable local-first product baseline with CLI, daemon, HTTP API, MCP bridge, browser console, and optional desktop shell
- the top-level docs now prioritize current truth, while deep implementation history lives under `docs/archive/`
- the live install, doctor, and health checks are ready after the April 23 repair pass
- the active audit-fix branch is ready for review after verification completes

## Verification status

The cleanup, Operator Home, and audit-fix work were verified locally with:

- `npm run typecheck`
- `npm run build`
- focused CLI and docs-navigation checks
- `npm test`
- `npm run release:check:ci`
- `npm run verify:recovery`
- `npm audit`
- `personal-ops install check --json`
- `personal-ops doctor --deep --json`
- `personal-ops health check --deep --json`

At the end of the latest pass:

- the main test suite passed
- the docs-navigation checks passed
- the CI-style local release baseline passed
- the Operator Home Phase 1 merge was rechecked on current `main`
- the live runtime returned to `ready` after wrapper, desktop, auth, and snapshot repair

## What to read first when resuming

If you need current truth:

- `README.md`
- `START-HERE.md`
- `docs/ASSISTANT-LED-ROADMAP.md`
- this file

If you need the historical implementation trail:

- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md`
- `docs/archive/README.md`

## Current product direction

The next build direction is no longer emergency cleanup. The current product direction is to grow `personal-ops` toward an Operator Home while continuing small maintainability extractions.

What is already true:

- the repo has a stable verified baseline
- the first Operator Home shell is now present in `workspace_home`
- that shell is intentionally local-first and does not yet stitch in broader sibling-system integrations
- bridge-db activity logging is now injectable so tests can stay isolated from live operating state
- shared service-test fixture setup now lives outside the monolithic `service.test.ts`
- outbound bridge activity logging now flows through a small compatibility helper instead of inline `service.ts` calls

What that means for the next session:

- build on the new operator-home shell instead of reopening broad cleanup work
- start with Operator Inbox foundations as the next Operator Home slice
- keep external-system ownership boundaries intact while preparing future integration seams
- treat `personal-ops` as the operator-facing layer, not the source of truth for every sibling system

## Suggested next focus

Good next-session starting points:

- define the Operator Inbox foundations contract on top of Workspace Home 2.0
- keep Decision Console and deeper working-set / evidence-card refinement behind that first inbox slice
- continue extracting high-churn code out of `app/src/service.ts` only behind compatibility facades
- keep using the current docs layer for truth and the archive only for deep history
