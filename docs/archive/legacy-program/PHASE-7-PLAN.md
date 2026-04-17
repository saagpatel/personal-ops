# Phase 7 Plan

## Title

Decide the Multi-Machine Strategy

## Summary

Phase 7 makes the machine-ownership model explicit without adding sync or widening trust boundaries.

Defaults locked for this phase:

- one primary machine owns active local state
- backups are the supported recovery and intentional migration mechanism
- no live sync or merge behavior
- cross-machine restore requires explicit `--allow-cross-machine`
- machine identity and restore provenance live in local state files, not new DB schema

## Main additions

- add local machine identity and restore provenance files
- add machine-aware snapshot metadata
- add explicit cross-machine restore guardrails
- surface machine posture in status, install-check, and doctor
- update docs so the single-primary-machine model is explicit

## Verification

Phase 7 is complete only if all of these pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- live sanity pass:
  - `personal-ops --help`
  - `personal-ops install check`
  - `personal-ops status`
  - `personal-ops worklist`
  - `personal-ops doctor`
  - `personal-ops doctor --deep --json`
  - `personal-ops backup create --json`
  - `personal-ops backup inspect <new-snapshot-id> --json`

## Closeout

Phase 7 must end with:

- branch `codex/phase-7-multi-machine-strategy`
- Conventional Commit commits
- push to GitHub
- draft PR
- `docs/PHASE-7-ROLLOUT.md` updated with verification results and closeout metadata
