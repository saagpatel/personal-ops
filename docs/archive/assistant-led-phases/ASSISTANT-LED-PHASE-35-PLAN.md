# Assistant-Led Phase 35 Plan

Date: 2026-04-14
Status: Complete

## Goal

Validate that the shipped Phase 34 proof-gated review/approval presentation is stable enough to remain the default, while cleaning the workflow, verifier, and documentation drift around it and upgrading the assistant-led closeout contract for every future phase.

## Starting Point

Phase 34 already shipped the actual review/approval presentation adjustment.

That means Phase 35 is **not** a new surface-design phase.

It starts from a system where:

- the proof gate already exists and is protected by deterministic tests
- status and console already share the same proof-gated presentation rules
- grouped outbound still stays structurally primary when present
- browser-backed console verification now exists inside `npm test`
- CI already installs Playwright Chromium before running `npm test`
- release workflow parity, verifier naming, and documentation routing still lag behind the shipped behavior

The next question is not:

- should we redesign the review/approval surface again?

It is:

- does the shipped Phase 34 presentation remain stable when exercised through the named verifier and ship path?
- can the repo explain current truth and historical context without contradiction?
- can this phase leave behind a stronger closeout rule than the one it inherited?

## Scope

Phase 35 delivers:

- release/CI browser-test parity while `release:check:ci` continues to run `npm test`
- one narrow `verify-console` scenario that validates the shipped proof-gated review/approval browser behavior
- stale verifier banner cleanup so routine verification output stops pointing at old phase labels
- current-truth versus historical-truth documentation cleanup across the main onboarding path
- a stronger assistant-led closeout standard encoded in the roadmap
- a short future horizon so the rollout can include a detailed next phase and one-line remaining phases

Phase 35 does **not** deliver:

- no `pickFlowCandidate` changes
- no review, approval, send, or grouped outbound lifecycle changes
- no calibration heuristic or threshold changes
- no new schema, routes, commands, MCP tools, or queue kinds
- no browser authority expansion
- no widening of the current console asset allowlist unless a real shipped-contract bug requires it
- no change to the current exact-string dedupe against `workspace_home`
- no change to the current `/console/*.js` route shape

## Canonical Truth Ordering

This phase makes artifact ownership explicit:

- `docs/ASSISTANT-LED-ROADMAP.md` is the current and future source of truth
- `docs/ASSISTANT-LED-PHASE-35-PLAN.md` is the implementation contract for this phase
- `docs/ASSISTANT-LED-PHASE-35-ROLLOUT.md` becomes the shipped summary and cleanup record for this phase
- `docs/PROGRAM-COMPLETE-SUMMARY.md` remains in the repo as historical context, not as the current system state

## Workflow Parity Contract

Phase 35 keeps `release:check:ci` unchanged:

- `npm run typecheck`
- `npm run test`
- `npm run verify:smoke`

Because `npm test` already includes browser-backed console checks, the release workflow must satisfy the same browser prerequisite as CI:

- install Playwright Chromium before running `npm run release:check:ci`

The hardening test suite must protect that parity so it does not silently drift again.

## Verifier Ownership

Deterministic tests remain the owner of:

- proof-gate logic
- status/console alignment
- MCP review/approval seam behavior
- bounded console module loading

`verify-console` gains exactly one narrow Phase 35-specific job:

- validate the shipped proof-gated review/approval browser behavior end to end

That scenario should prove:

- the proof gate can be opened with seeded evidence
- the promoted supporting explanation is visible in the console
- the generic default review-focus note is not acting as the dominant message when stronger proof exists

Phase 35 must not duplicate proof-gate logic assertions inside `verify-console`.

## Documentation Cleanup Contract

The onboarding path should route current readers to the roadmap first.

That means Phase 35 updates:

- `README.md`
- `START-HERE.md`
- `docs/NEW-MACHINE-SETUP.md`
- `docs/PROGRAM-COMPLETE-SUMMARY.md`
- `docs/IMPROVEMENT-ROADMAP.md`
- `app/test/docs-navigation.test.ts`

The cleanup goal is not to erase history.

It is to stop history from pretending to be current state.

## Closeout Standard

Before Phase 35 can be called complete, the phase must leave behind:

- a review of what it built
- cleanup of what it no longer needs
- a shipped summary
- a detailed Phase 36 writeup
- one-line Phase 37 and Phase 38 notes

That same structure becomes the required closeout shape for all future assistant-led phases.

## Verification Plan

Required local gates before merge:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

Direct coverage should include:

- release and CI browser-prerequisite parity
- one narrow browser verification of the proof-gated review/approval presentation
- unchanged deterministic ownership of proof-gate logic and review/approval seams
- documentation routing that reflects the new current-truth ordering

## Closeout Contract

Before Phase 35 is called complete:

- update `docs/ASSISTANT-LED-PHASE-35-ROLLOUT.md`
- update the roadmap so Phase 35 is marked complete and Phase 36 is named as the next target
- verify every planned Phase 35 item is complete
- complete branch, PR, merge, post-merge CI wait, local `main` sync, and branch cleanup

The roadmap must not be marked complete until:

- the rollout doc exists
- the merge is done
- post-merge CI on `main` is green
