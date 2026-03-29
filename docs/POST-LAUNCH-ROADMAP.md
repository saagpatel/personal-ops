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
| 3 | Reliability and Recovery Automation | Make long-term operation safer with retention, recurring snapshots, and restore confidence loops | Planned |
| 4 | Release and Distribution Polish | Make shipping, upgrading, versioning, and release communication more product-like | Planned |
| 5 | Workflow Actions and Bundles | Add stronger “do the next thing” flows across inbox, tasks, planning, and calendar | Planned |
| 6 | Intelligence Layer | Improve prioritization, recommendation quality, meeting prep, and operator guidance | Planned |
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

This phase should make long-running operation safer.

Good targets:

- recurring automatic snapshots with explicit retention policy
- snapshot freshness policy and warnings
- restore rehearsal workflow against fixtures
- daemon drift detection
- recovery runbooks tied more tightly to automated checks

## Phase 4: Release and Distribution Polish

This phase should make `personal-ops` feel more like a maintained product.

Good targets:

- versioning strategy
- changelog / release notes workflow
- tagged releases
- upgrade instructions or upgrade helpers
- stronger release check documentation and branch discipline
- optional release packaging polish

## Phase 5: Workflow Actions and Bundles

This phase should make the system more operationally useful, not just more observable.

Good targets:

- “prep my day” workflow
- inbox cleanup bundles
- task and follow-up batching
- better meeting-prep workflows
- more natural inbox-to-task and recommendation-to-action loops

## Phase 6: Intelligence Layer

This phase should improve the quality of prioritization and guidance.

Good targets:

- better ranking across inbox, tasks, planning, and calendar
- stronger recommendation scoring
- deadline-risk detection
- meeting prep summaries
- better “what should I do next?” synthesis

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
- the recommended next build is Phase 3: Reliability and Recovery Automation
- post-launch work should stay conservative about trust boundaries and operator control
- future post-launch phases should follow the same pattern as before:
  - a plan
  - a rollout
  - full verification
  - an explicit next-phase recommendation
