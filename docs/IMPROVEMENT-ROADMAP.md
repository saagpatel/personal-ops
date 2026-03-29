# Improvement Roadmap

## Baseline

`personal-ops` completed the earlier Phase 1 to 33 build, cleanup, governance, audit, and documentation program with a stable verified baseline. The system currently preserves:

- schema version `14`
- ranking version `phase12-v1`
- narrow assistant-safe audit inputs of `limit` and optional `category`
- supported audit categories of `sync`, `task`, `task_suggestion`, and `planning`
- operator-controlled trust boundaries for risky or external mutation flows

The current roadmap starts after that completed program. It focuses on productization, maintainability, confidence, operator experience, documentation layering, secrets resilience, multi-machine strategy, and a future operator console.

## Phase Ledger

| Phase | Title | Goal | Status | Primary Docs |
| --- | --- | --- | --- | --- |
| 1 | Install Like a Product | Make new-machine setup, wrapper install, LaunchAgent setup, and restore feel first-class | Completed | `docs/PHASE-1-ROLLOUT.md` |
| 2 | Refactor the Core and Create Durable Roadmap Memory | Preserve roadmap intent in-repo and split large core files into safer internal modules | Completed | `docs/PHASE-2-PLAN.md`, `docs/PHASE-2-ROLLOUT.md` |
| 3 | Add End-To-End Confidence Checks | Prove install, daemon, HTTP, MCP, backup, and restore all work as a product stack | Completed | `docs/PHASE-3-PLAN.md`, `docs/PHASE-3-ROLLOUT.md` |
| 4 | Improve Daily Operator Experience | Make CLI help, diagnostics, errors, logs, and operator shortcuts clearer | Completed | `docs/PHASE-4-PLAN.md`, `docs/PHASE-4-ROLLOUT.md` |
| 5 | Create Better Documentation Layers | Add stronger onboarding, operations, and architecture docs | Completed | `docs/PHASE-5-PLAN.md`, `docs/PHASE-5-ROLLOUT.md` |
| 6 | Strengthen Secrets and Safety Operations | Improve secret bootstrap, validation, recovery, and rotation guidance | Completed | `docs/PHASE-6-PLAN.md`, `docs/PHASE-6-ROLLOUT.md` |
| 7 | Decide the Multi-Machine Strategy | Make machine ownership and portability intentional instead of accidental | Planned | `docs/PHASE-7-PLAN.md` |
| 8 | Build a Lightweight Operator Console | Add a local web console on top of the stable backend surfaces | Planned | `docs/PHASE-8-PLAN.md` |

## Phase 1

Phase 1 added a product-style operational layer around the stable baseline:

- root `./bootstrap`
- local `install all`, `install check`, wrapper install, and LaunchAgent install commands
- stronger local install and environment checks
- first-class backup restore with rescue snapshot behavior
- generated wrapper and LaunchAgent artifacts managed from code instead of docs snippets

Phase 1 preserved the existing trust model and did not expand assistant-safe permissions or change the HTTP and MCP contracts.

## Phase 2

Phase 2 has two linked goals:

- write the post-program roadmap into the repo so compaction does not become the only place where current intent lives
- refactor the large core files into domain-based modules while keeping current behavior stable

The key refactor targets are:

- `app/src/cli.ts`
- `app/src/formatters.ts`
- `app/src/service.ts`
- `app/src/db.ts`

The Phase 2 refactor must preserve:

- existing CLI behavior, including the new Phase 1 install and restore commands
- existing HTTP routes and response contracts
- existing MCP tools and argument contracts
- current schema version unless a concrete bugfix requires otherwise
- operator-only mutation boundaries and current audit and governance protections

## Phase 3

Phase 3 added real end-to-end confidence checks for the installed product:

- fresh-machine bootstrap smoke test
- daemon boot verification
- local HTTP smoke checks
- MCP smoke checks
- backup and restore recovery verification
- install and start verification

Phase 3 also found and fixed a real restore bug: stale SQLite sidecar files could survive restore and replay post-snapshot mutations. The phase now closes with both isolated temp-home verification and a real-machine sanity pass over the installed operator commands.

## Phase 4

Phase 4 completed a conservative operator-UX pass without changing trusted backend contracts:

- clearer top-level CLI help and command descriptions
- clearer human-readable `status`, `worklist`, `doctor`, and install-check output
- friendlier daemon-unreachable CLI errors
- a new read-only `personal-ops now` shortcut for the shortest operator summary
- focused CLI UX tests on top of the existing full verification stack

## Phase 5

Phase 5 completed the new documentation layer:

- `START-HERE.md`
- `OPERATIONS.md`
- `ARCHITECTURE.md`
- `QUICK-GUIDE.md`

Historical phase docs should remain history, not onboarding.

## Phase 6

Phase 6 completed a conservative secrets-and-auth hardening pass:

- stronger OAuth client validation for missing, placeholder, malformed, and non-desktop configs
- stronger API token checks for empty files and broad file permissions
- clearer Keychain diagnostics that separate missing items from unavailable access
- clearer re-auth and stale-grant recovery guidance in doctor, install-check, auth flows, and docs
- collision-safe snapshot ids so fast rescue snapshots cannot overwrite the snapshot being restored
- no new destructive secret reset or rotation commands

## Phase 7

Phase 7 should define the multi-machine model:

- whether state is single-machine or portable
- whether backups are the supported transfer mechanism
- whether one machine is primary
- how split-brain is prevented

## Phase 8

Phase 8 should add a lightweight operator console backed by the existing local HTTP API:

- status
- worklist
- approvals
- drafts
- audit
- planning
- backup and restore

## Current Working Memory

### Current Goal

Phase 6 is complete. The repo now has stronger secret and auth diagnostics on top of the verified product baseline, and the next improvement target is Phase 7 multi-machine strategy.

### Guardrails

- do not widen assistant permissions
- do not change the supported audit and governance contracts
- do not change HTTP or MCP contracts
- do not change schema version without a clearly justified bugfix
- preserve current Phase 1 install and restore behavior
- keep the new operator-facing wording aligned with the underlying trust model
- keep the new docs layer aligned with the verified command surface and trust model
- use the Phase 3 verification commands and the later live sanity passes as the baseline confidence layer for later phases

### Current Assumptions

- the completed governance and audit program remains the stable baseline
- Phase 1 is complete and recorded in repo docs
- Phase 2 completed the first compatibility-façade refactor slice
- Phase 3 verification now protects install, daemon, HTTP, MCP, backup, restore, and LaunchAgent behavior
- Phase 4 improved human-readable operator guidance without changing JSON, HTTP, MCP, audit, governance, or schema contracts
- Phase 5 added the new primary onboarding and reference docs without changing behavior contracts
- Phase 6 improved secret bootstrap, validation, Keychain diagnostics, and auth recovery guidance without widening permissions
- future phases should extend or consume the existing verification layer instead of creating parallel test flows

### Required End-of-Phase Verification

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- real-machine sanity pass over install check, status, worklist, doctor, and backup create when the phase touches operator-facing stack behavior

### Preserve Across Compaction

- this document is the canonical roadmap index for the new post-program track
- every completed phase must have both a plan doc and a rollout doc
- the current baseline after Phase 33 is stable and trusted
- Phase 1 is complete and verified
- Phase 2 completed the durable roadmap memory pattern and the first compatibility-façade refactor slice
- Phase 3 completed the isolated product verification layer and fixed a real restore edge around SQLite sidecar files
- Phase 4 completed a conservative operator UX pass and added a short `personal-ops now` summary without widening permissions
- Phase 5 completed the main docs layer with `START-HERE`, `OPERATIONS`, `ARCHITECTURE`, and `QUICK-GUIDE`
- Phase 6 completed the conservative secrets-and-safety hardening pass with stronger auth diagnostics and docs
- Phase 6 also made snapshot ids collision-safe after a closeout-discovered restore edge
- every future phase ends with a verification summary and an explicit next-phase recommendation

## Phase Completion Rule

Every roadmap phase must end with all of the following recorded in the repo:

- a `PHASE-N-PLAN.md` doc
- a `PHASE-N-ROLLOUT.md` doc
- a verification summary with commands run and results
- an explicit recommendation for the next phase
