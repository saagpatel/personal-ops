# Current State

Date: 2026-04-17
Status: Stable baseline after cleanup plus Operator Home Phase 1

This note captures the repo state after the April 2026 audit, stabilization, and documentation cleanup pass, plus the first Operator Home implementation slice that followed it.

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

## Current repo posture

`personal-ops` is currently in a strong maintenance-and-iteration state:

- the assistant-led delivery track is complete through Phase 38
- Operator Home Phase 1 is merged on top of that stable baseline
- the repo keeps a stable local-first product baseline with CLI, daemon, HTTP API, MCP bridge, browser console, and optional desktop shell
- the top-level docs now prioritize current truth, while deep implementation history lives under `docs/archive/`
- the repo is back on clean `main` after PR #61
- the branch is ready for further feature work without needing another cleanup pass first

## Verification status

The cleanup and follow-on Operator Home work were verified locally with:

- `npm run typecheck`
- `npm run build`
- focused CLI and docs-navigation checks
- `npm test`
- `npm run release:check:ci`

At the end of the latest pass:

- the main test suite passed
- the docs-navigation checks passed
- the CI-style local release baseline passed
- the Operator Home Phase 1 merge was rechecked on current `main`

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

The next build direction is no longer cleanup. The current product direction is to grow `personal-ops` toward an Operator Home.

What is already true:

- the repo has a stable verified baseline
- the first Operator Home shell is now present in `workspace_home`
- that shell is intentionally local-first and does not yet stitch in broader sibling-system integrations

What that means for the next session:

- build on the new operator-home shell instead of reopening broad cleanup work
- keep external-system ownership boundaries intact while preparing future integration seams
- treat `personal-ops` as the operator-facing layer, not the source of truth for every sibling system

## Suggested next focus

Good next-session starting points:

- choose the next Operator Home slice to build on top of Workspace Home 2.0
- decide whether the next step is Operator Inbox foundations, Decision Console foundations, or deeper working-set / evidence-card refinement
- keep using the current docs layer for truth and the archive only for deep history
