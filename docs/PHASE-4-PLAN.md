# Phase 4 Plan

## Title

Improve Daily Operator Experience

## Summary

Phase 4 is a conservative operator-UX pass on top of the verified Phase 1 to 3 baseline. The goal is to make daily use clearer and calmer without widening permissions, changing trust boundaries, or redesigning the command surface.

Chosen defaults for this phase:

- keep existing commands and semantics stable
- keep changes centered in the CLI and formatter layers
- add at most one new read-only operator shortcut
- preserve HTTP, MCP, audit, governance, and schema contracts
- close the phase with the full verification stack plus branch, commit, push, and draft PR

## Scope

Phase 4 should improve:

- top-level CLI help and command descriptions
- human-readable `status`, `worklist`, `doctor`, and install-check output
- common local CLI error handling, especially daemon-unreachable cases
- one short attention-oriented operator shortcut
- degraded-state explanations and next-step guidance

Phase 4 must not:

- widen assistant permissions
- add mutation capability
- change existing command semantics
- change HTTP or MCP contracts unless a tiny additive read-only improvement is truly required
- change audit or governance boundaries
- change schema version

## Planned Changes

### 1. Improve top-level CLI guidance

- make `personal-ops --help` feel more like a product entrypoint
- tighten descriptions for the main top-level groups
- add a short "Start here" guide in help output

### 2. Improve human-readable runtime output

- make `status` lead with the current state, top attention, and next steps
- make `worklist` easier to act on with clearer grouping and command hints
- make `doctor` focus on warnings and failures instead of overwhelming pass output
- align wording across `status`, `doctor`, `install check`, and restore output

### 3. Improve local CLI failure messages

- make daemon-unreachable errors explain what to run next
- keep setup problems and runtime problems easier to distinguish
- preserve raw detail where it matters, but improve default readability

### 4. Add one small shortcut

Chosen addition:

- `personal-ops now`

This shortcut should:

- stay read-only
- be formatter-driven
- reuse existing status and worklist data
- provide the shortest attention-oriented summary

### 5. Record the phase in repo docs

Phase 4 should add or update:

- `docs/PHASE-4-PLAN.md`
- `docs/PHASE-4-ROLLOUT.md`
- `docs/IMPROVEMENT-ROADMAP.md`

## Verification

Phase 4 is complete only if all of the following pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `personal-ops --help`
- key subcommand help for touched groups
- `personal-ops status`
- `personal-ops worklist`
- `personal-ops doctor`
- `personal-ops install check`
- `personal-ops backup create`
- `personal-ops doctor --deep` if needed after wording changes

## Closeout

End-of-phase delivery must include:

- dedicated `codex/` branch
- Conventional Commit message
- push to GitHub
- draft PR
- rollout doc updated with branch, commit, verification commands, results, and next-phase recommendation
