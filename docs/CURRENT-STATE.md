# Current State

Date: 2026-04-24
Status: Operator Inbox implementation in progress on a stable baseline

This note captures the repo state after the April 2026 audit, stabilization, documentation cleanup pass, Operator Home Phase 1, the follow-up audit fixes, and the first Operator Inbox implementation slice on `codex/operator-inbox-phases`.

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

### Operator Inbox slice

- added a typed `OperatorInboxReport` contract for priority, state, source ownership, safe actions, freshness, confidence, and evidence
- added an additive `app/src/service/operator-inbox.ts` read model that composes existing local surfaces instead of creating a second authority layer
- wired the report through service, HTTP, CLI, MCP, and the browser console as a read-only operator surface
- included read-only external adapters for bridge-db handoffs, notification-hub urgent events, GitHub Repo Auditor portfolio truth, and Notion project snapshots
- kept unavailable external sources visible as source states rather than treating them as fatal errors
- added focused Operator Inbox tests for repair priority, external read-only source handling, and formatter output

## Current repo posture

`personal-ops` is currently in a strong maintenance-and-iteration state:

- the assistant-led delivery track is complete through Phase 38
- Operator Home Phase 1 is merged on top of that stable baseline
- the repo keeps a stable local-first product baseline with CLI, daemon, HTTP API, MCP bridge, browser console, and optional desktop shell
- the top-level docs now prioritize current truth, while deep implementation history lives under `docs/archive/`
- the live install, doctor, and health checks are ready after the April 23 repair pass
- the active Operator Inbox branch is additive and should be verified fully before merge

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

At the end of the audit-fix pass:

- the main test suite passed
- the docs-navigation checks passed
- the CI-style local release baseline passed
- the Operator Home Phase 1 merge was rechecked on current `main`
- the live runtime returned to `ready` after wrapper, desktop, auth, and snapshot repair

For the Operator Inbox slice so far:

- `npm --prefix app run typecheck` passed
- `npm --prefix app run build` passed
- `node --test app/dist/test/operator-inbox.test.js` passed
- `npm --prefix app run release:check:ci` passed after the console bundle fix
- `npm --prefix app run verify:console` passed
- `npm --prefix app run verify:recovery` passed
- `npm --prefix app audit` reported 0 vulnerabilities
- `personal-ops install all --json` refreshed the installed wrappers/LaunchAgent runtime
- `personal-ops install check --json` returned ready (62 pass / 0 warn / 0 fail)
- `personal-ops health check --deep --json` returned ready (6 pass / 0 warn / 0 fail)

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
- the Operator Inbox now stitches sibling-system integrations only as read-only signal adapters
- bridge-db activity logging is now injectable so tests can stay isolated from live operating state
- shared service-test fixture setup now lives outside the monolithic `service.test.ts`
- outbound bridge activity logging now flows through a small compatibility helper instead of inline `service.ts` calls

What that means for the next session:

- build on the new operator-home shell instead of reopening broad cleanup work
- finish verification and review for the Operator Inbox foundations slice
- keep external-system ownership boundaries intact while preparing future integration seams
- treat `personal-ops` as the operator-facing layer, not the source of truth for every sibling system

## Suggested next focus

Good next-session starting points:

- harden Operator Inbox outcome tracking and noise controls after the first slice is merged
- keep Decision Console and deeper working-set / evidence-card refinement behind the inbox foundations slice
- continue extracting high-churn code out of `app/src/service.ts` only behind compatibility facades
- keep using the current docs layer for truth and the archive only for deep history
