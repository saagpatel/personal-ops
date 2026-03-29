# Post-Launch Roadmap

## Purpose

This roadmap starts after the completed Phase 1 to 8 product roadmap and the follow-on hardening pass. It is for the next layer of product maturity: automation, stronger operator workflows, deeper UI, reliability polish, release discipline, and selective expansion.

This document is the durable source of truth for the post-launch track. If future sessions compact, this file should remain the first place to look for what comes next.

## Current Baseline

`personal-ops` currently has:

- productized bootstrap, wrappers, LaunchAgent install, and restore flow
- a stable CLI, local HTTP API, and MCP bridge
- end-to-end verification for smoke, full-stack, console, and LaunchAgent flows
- a lightly interactive local operator console with narrow browser-safe actions
- explicit secret-safety, machine-ownership, and recovery guardrails
- a release gate and CI baseline
- a recurring-friendly `personal-ops health check`

The post-launch roadmap should build on those foundations instead of reworking them.

## Phase Ledger

| Phase | Title | Goal | Status |
| --- | --- | --- | --- |
| 1 | Automation and Daily Briefings | Make the system proactively useful through recurring checks, summaries, and operator nudges | Completed |
| 2 | Console Phase 2 | Add a narrow, high-value set of safe operator actions and richer detail views to the console | Completed |
| 3 | Reliability and Recovery Automation | Make long-term operation safer with retention, recurring snapshots, and restore confidence loops | Completed |
| 4 | Release and Distribution Polish | Make shipping, upgrading, versioning, and release communication more product-like | Completed |
| 5 | Workflow Actions and Bundles | Add stronger “do the next thing” flows across inbox, tasks, planning, and calendar | Completed |
| 6 | Intelligence Layer | Improve prioritization, recommendation quality, meeting prep, and operator guidance | Completed |
| 7 | Integrations and Context Expansion | Add the next external systems only where they make the operator loop meaningfully stronger | Planned |

## Phase 1: Automation and Daily Briefings

Phase 1 is complete.

### Goal

Make `personal-ops` more proactive without widening permissions or skipping operator control. The system should help the operator stay ahead of drift, priorities, and daily planning through recurring read-first automations.

### Scope

Focus on automations that summarize, surface, and remind. Do not start with high-trust mutations.

Priority targets:

- morning briefing automation
- end-of-day wrap-up automation
- recurring health-check automation
- backup freshness automation
- stale follow-up and overdue-task nudges
- optional meeting-prep summary automation

### Expected Outcomes

- one or more saved automations that use the completed verification and health surfaces
- stronger operator rhythm around `now`, `worklist`, `health check`, and snapshot freshness
- reusable automation patterns that later phases can extend

Delivered in this phase:

- `Morning Brief`
- `Midday Health Guard`
- `End-of-Day Wrap-Up`
- repo automation docs in `docs/AUTOMATIONS.md`
- a dedicated phase plan and rollout record

### Guardrails

- keep automations read-first by default
- no destructive background actions
- no silent auth flows
- no background restore, send, or approval actions
- reuse existing CLI and safe read surfaces where possible

## Phase 2: Console Phase 2

Phase 2 is complete.

### Goal

Turn the read-first console into a lightly interactive operator workspace without widening the trust model too far.

### Delivered

- snapshot creation from the console
- planning recommendation apply, snooze, and reject from the console
- planning recommendation group snooze and reject from the console
- richer detail views inside Worklist, Planning, Overview, Approvals, and Backups
- explicit CLI handoff for high-trust actions that remain browser-blocked

### Guardrails kept

- approvals remain CLI-only
- tasks remain CLI-only
- restore remains CLI-only
- auth remains CLI-only
- send and other broader admin actions remain CLI-only
- browser-session auth stays route-based and explicit

## Phase 3: Reliability and Recovery Automation

Phase 3 is complete.

### Delivered

- `personal-ops backup prune` with a fixed tiered retention policy
- additive health and doctor recovery signals for freshness, prune pressure, and rehearsal staleness
- `npm run verify:recovery` as the restore confidence loop
- updated Codex reliability automations for midday health, end-of-day recovery snapshotting, and weekly rehearsal reminder
- updated docs for recurring recovery operations

## Phase 4: Release and Distribution Polish

Phase 4 is complete.

### Delivered

- explicit version visibility through `personal-ops version`
- additive `service_version` in `status`
- console Overview version display
- `CHANGELOG.md` and `UPGRADING.md`
- `release:prep` and `release:notes` helper scripts
- tag-driven GitHub Release workflow for source-based releases
- clearer release and upgrade docs for the source-first distribution model

## Phase 5: Workflow Actions and Bundles

Phase 5 is complete.

### Delivered

- `personal-ops workflow prep-day`
- `personal-ops workflow follow-up-block`
- `personal-ops workflow prep-meetings`
- read-only workflow HTTP reads for the console
- Overview workflow bundle surfacing and action handoff
- Morning Brief now sourcing from the shared day-start bundle

### Guardrails kept

- workflow bundles stay read-first
- higher-trust actions still run through the existing CLI paths
- browser mutation scope does not widen in this phase
- no new planning store or bundle executor is introduced

## Phase 6: Intelligence Layer

Phase 6 is complete.

### Delivered

- `personal-ops workflow now-next`
- `GET /v1/workflows/now-next`
- deterministic next-move ranking across tasks, inbox, planning, meetings, and readiness repair
- additive `why_now`, `score_band`, and `signals` workflow fields
- smarter `prep-day`, `follow-up-block`, and `prep-meetings` ordering
- console Overview now-next surfacing and richer worklist intelligence detail
- Morning Brief now sourcing from both `workflow now-next` and `workflow prep-day`

### Guardrails kept

- intelligence remains deterministic and read-first
- no schema change
- no new browser mutation scope
- no bulk workflow executor
- higher-trust actions still stay in the existing CLI paths

## Phase 7: Integrations and Context Expansion

This phase should only happen where added context clearly improves the operator loop.

Likely candidates:

- Slack
- Notion
- deeper Google Drive / Docs linkage
- GitHub work tracking context

Each integration should justify its trust boundary, operator value, and maintenance cost.

## Recommended Order

Build the post-launch roadmap in this order:

1. Phase 1: Automation and Daily Briefings
2. Phase 2: Console Phase 2
3. Phase 3: Reliability and Recovery Automation
4. Phase 4: Release and Distribution Polish
5. Phase 5: Workflow Actions and Bundles
6. Phase 6: Intelligence Layer
7. Phase 7: Integrations and Context Expansion

This order keeps the next work close to the strongest current foundation:

- the system already has health checks, verification, docs, and a console shell
- automation adds immediate operator value
- console interactivity becomes safer once recurring checks and operator rhythms are clear
- reliability and release polish then deepen trust
- workflow intelligence and integrations can build on a more mature base

## Preserve Across Compaction

- the original Phase 1 to 8 roadmap is complete
- the follow-on hardening pass is complete
- the next roadmap starts here, in `docs/POST-LAUNCH-ROADMAP.md`
- the recommended next build is Phase 7: Integrations and Context Expansion
- post-launch work should stay conservative about trust boundaries and operator control
- future post-launch phases should follow the same pattern as before:
  - a plan
  - a rollout
  - full verification
  - an explicit next-phase recommendation
