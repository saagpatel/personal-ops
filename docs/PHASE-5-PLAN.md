# Phase 5 Plan

## Title

Create Better Documentation Layers

## Summary

Phase 5 turns the current useful but fragmented docs set into a clear documentation system with role-based entry points, an operational runbook, and an architecture reference.

Chosen defaults:

- make the new docs the main entry path
- add a separate quick guide for a new operator and a new assistant
- keep `README.md` product-facing
- keep historical phase docs as history, not onboarding
- add a lightweight docs-navigation test
- close the phase with the same full verification posture as Phase 4 plus branch, commit, push, and draft PR closeout

## Main additions

Create these new root docs:

- `START-HERE.md`
- `OPERATIONS.md`
- `ARCHITECTURE.md`
- `QUICK-GUIDE.md`

Create or update these phase records:

- `docs/PHASE-5-PLAN.md`
- `docs/PHASE-5-ROLLOUT.md`
- `docs/IMPROVEMENT-ROADMAP.md`

## Navigation changes

- `README.md` should hand off first to `START-HERE.md`
- `CLIENTS.md` should point to `START-HERE.md` and `QUICK-GUIDE.md`
- `docs/NEW-MACHINE-SETUP.md` should become a supporting appendix rather than the main onboarding path
- `START-HERE.md` should point clearly to operations, architecture, quick guide, client contract, and history docs

## Required content

### OPERATIONS

Must cover:

- `./bootstrap`
- local wrappers and LaunchAgent behavior
- Gmail and Google Calendar auth flow
- daily commands:
  - `personal-ops now`
  - `personal-ops status`
  - `personal-ops worklist`
  - `personal-ops doctor`
  - `personal-ops install check`
- backup and restore behavior
- safe rerun paths
- setup, daemon, and auth troubleshooting

### ARCHITECTURE

Must cover:

- project purpose
- runtime pieces
- trust model
- local state and paths
- CLI, HTTP, and MCP surfaces
- operator-only vs assistant-safe boundaries
- current module layout after Phases 2 and 4
- where future work should land

### QUICK-GUIDE

Must cover:

- new operator fast-start
- new assistant fast-start
- which docs each role should read next

## Verification

Phase 5 is complete only if all of these pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- live sanity pass:
  - `personal-ops --help`
  - `personal-ops now`
  - `personal-ops status`
  - `personal-ops doctor`
  - `personal-ops install check`
  - `personal-ops doctor --deep --json`
  - `personal-ops backup create --json`

Also verify:

- the operator doc path from `README.md` works end to end
- the assistant doc path from `README.md` works end to end
- the new primary doc chain has no dead-end links

## Closeout

Phase 5 must end with:

- branch `codex/phase-5-documentation-layers`
- Conventional Commit commit message
- push to GitHub
- draft PR
- `docs/PHASE-5-ROLLOUT.md` updated with verification results and closeout metadata
