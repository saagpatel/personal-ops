# Phase 2 Rollout

## Title

Phase 2: Refactor the Core and Create Durable Roadmap Memory

## Status

Completed.

## Goal

Preserve the post-program roadmap inside the repo and reduce maintenance risk by moving the largest core files toward stable domain modules without changing trusted behavior.

## What Changed

### Durable roadmap memory

Added the new post-program documentation layer:

- `docs/IMPROVEMENT-ROADMAP.md`
- `docs/PHASE-1-ROLLOUT.md`
- `docs/PHASE-2-PLAN.md`
- `docs/PHASE-2-ROLLOUT.md`

This is now the durable memory pattern for the remaining roadmap phases.

### Formatter split

Split the former monolithic formatter file into domain modules under `app/src/formatters/`:

- `status.ts`
- `governance.ts`
- `install.ts`
- `inbox.ts`
- `calendar.ts`
- `tasks.ts`
- `planning.ts`
- `shared.ts`

Kept `app/src/formatters.ts` as the compatibility façade.

### Service extraction

Moved read-heavy and reporting-oriented service logic into `app/src/service/` helper modules:

- `status.ts`
- `install.ts`
- `audit.ts`

Kept `app/src/service.ts` as the service façade and orchestration layer.

### CLI extraction

Moved shared CLI plumbing and selected command groups into `app/src/cli/`:

- `http-client.ts`
- `shared.ts`
- `commands/auth-mail.ts`
- `commands/runtime.ts`
- `commands/install.ts`

Kept `app/src/cli.ts` as the top-level entrypoint and command wiring surface while preserving command behavior.

### Bootstrap hardening

Adjusted `./bootstrap` to set `PERSONAL_OPS_APP_DIR` explicitly during install and install-check runs so fresh-clone bootstrap works even when the repo is not checked out under the target home directory.

## What Stayed Stable

- HTTP contract
- MCP contract
- schema version `14`
- ranking version `phase12-v1`
- audit and governance boundaries
- operator-only mutation boundaries
- Phase 1 install and restore behavior

## Verification

### Automated checks

- `npm run typecheck`
  - passed
- `npm test`
  - passed, `91/91`

### Real-product verification

- temp-home bootstrap rehearsal
  - passed after fixing the bootstrap app-dir environment handoff
  - ended in the expected `SETUP_REQUIRED` state on blank mailbox and OAuth input
- `personal-ops install check`
  - passed, `READY`
  - `23 pass / 0 warn / 0 fail`
- `personal-ops status`
  - passed
  - service reported `READY`
- `personal-ops doctor --deep`
  - passed, `READY`
  - `42 pass / 0 warn / 0 fail`
- `personal-ops worklist`
  - passed
- `personal-ops backup create --json`
  - passed
  - created snapshot `2026-03-29T06-07-25Z`

### Restore coverage

- fixture-based restore coverage remained green in automated tests

### Representative read-surface confidence

- representative HTTP and MCP-safe behavior remained covered by the passing automated suite
- no public contract changes were introduced during this phase

## Acceptable Residuals

- The new module pattern is established for formatters, service helpers, and CLI helpers and command groups.
- The larger DB query-family breakup remains future maintainability work, but current behavior and schema compatibility stayed intact for this phase.

## Recommended Next Phase

Proceed to Phase 3 next:

- add fresh-machine smoke checks
- add daemon, HTTP, and MCP stack smoke checks
- add backup and restore recovery verification
- prove the installed product works as a full stack, not just as unit-tested internals
