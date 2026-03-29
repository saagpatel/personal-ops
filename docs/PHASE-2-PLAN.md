# Phase 2 Plan

## Title

Phase 2: Refactor the Core and Create Durable Roadmap Memory

## Summary

Phase 2 does two things together:

- preserve the current post-program roadmap in repo docs so compaction does not become the only place where roadmap intent lives
- refactor the large core files into domain-based modules while preserving all current trusted behavior

This phase is intentionally behavior-preserving. It must not widen assistant permissions, change HTTP or MCP contracts, alter audit or governance boundaries, or introduce schema churn.

## Goals

- add durable roadmap memory in the repo
- reduce the maintainability risk from the largest source files
- keep the current external behavior stable
- prepare the codebase for later install testing, UX cleanup, doc layering, secret recovery, and UI work

## Deliverables

### Documentation memory

Add and maintain:

- `docs/IMPROVEMENT-ROADMAP.md`
- `docs/PHASE-1-ROLLOUT.md`
- `docs/PHASE-2-PLAN.md`
- `docs/PHASE-2-ROLLOUT.md`

### Code structure

Refactor toward:

- `app/src/cli/`
- `app/src/formatters/`
- `app/src/service/`
- `app/src/db/`

Keep these files as thin compatibility facades:

- `app/src/cli.ts`
- `app/src/formatters.ts`
- `app/src/service.ts`
- `app/src/db.ts`

## Refactor Sequence

1. Documentation memory first
- write the roadmap docs before large code moves
- capture completed Phase 1 inside the repo

2. Formatters and CLI next
- split formatter modules first
- split CLI helpers and command registration next

3. Service reads before writes
- move status, doctor, install-check, snapshot inspect and list, inbox reads, calendar reads, planning reads, and worklist/report assembly first
- move write-heavy logic only after the read paths are stable

4. DB modularization after service extraction
- move schema and migrations first
- then move targeted domain access helpers where safe
- keep `PersonalOpsDb` as the stable façade

5. Cleanup and rollout closeout
- update the roadmap index
- record verification evidence
- recommend the next phase

## Guardrails

- no HTTP contract changes
- no MCP contract changes
- no assistant permission changes
- no schema version changes unless a concrete bugfix requires one
- no trust model changes
- preserve the full Phase 1 install and restore behavior

## Future-Phase Preparation

Phase 2 should explicitly make later work easier:

- Phase 3: cleaner install, service, and CLI boundaries for end-to-end tests
- Phase 4: safer CLI and formatter polish
- Phase 5: roadmap docs become the base for onboarding and architecture docs
- Phase 6: clearer install and status boundaries for secret/bootstrap recovery work
- Phase 7: cleaner separation of install, restore, and docs for machine-strategy decisions
- Phase 8: clearer service boundaries under stable HTTP surfaces for the operator console

## Required Verification

Automated:

- `npm run typecheck`
- `npm test`

Real-product verification:

- temp-home bootstrap rehearsal
- `personal-ops install check`
- `personal-ops status`
- `personal-ops doctor --deep`
- `personal-ops worklist`
- `personal-ops backup create`
- confirm fixture-based restore remains covered in automated tests
- confirm representative HTTP and MCP read flows remain unchanged
