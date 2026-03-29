# Assistant-Led Workspace Roadmap

## Purpose

This roadmap starts after the completed post-launch track.

Its goal is to make `personal-ops` feel easier to use and more assistant-like:

- the console should become the main daily workspace
- the system should prepare more work before the operator asks
- the operator should spend more time reviewing and less time manually gathering context or chaining commands

This document is the durable source of truth for the next initiative.

## Baseline

`personal-ops` already has:

- a stable local daemon, CLI, HTTP API, and MCP bridge
- a lightly interactive browser console
- workflow bundles for day-start, follow-up, meeting prep, and now-next guidance
- deterministic ranking and narrow external context from GitHub plus Drive and Docs
- recurring automations for health, briefings, recovery snapshots, and rehearsal reminders
- verified backup, restore, and release gates

The next roadmap should deepen the assistant behavior on top of that baseline instead of rebuilding it.

## Phase Ledger

| Phase | Title | Goal | Status |
| --- | --- | --- | --- |
| 1 | Assistant Action Queue and Console-First Workflow Execution | Make the console the main working surface with a first-class assistant queue and safe one-click actions | Complete |
| 2 | Inbox and Follow-Up Autopilot | Reduce reply and follow-up labor through assistant-prepared drafts, grouped thread handling, and queue shaping | Complete |
| 3 | Meeting Prep and Execution Support | Pre-assemble upcoming meeting context, prep packets, and staging notes | Complete |
| 4 | Desktop Shell and Native UX | Wrap the matured console in a lightweight native shell with tray and notification support | Complete |
| 5 | Broader Google Context | Expand Google context where it materially improves planning, meeting prep, and workflow bundles | Planned |

## Phase 1

Phase 1 is complete and remains the baseline layer for the rest of the initiative.

### Goal

Shift the current console from a mostly inspection-oriented surface into the first assistant-led workspace.

### Scope

Phase 1 adds:

- a first-class assistant action queue in the console
- explicit action lifecycle states:
  - `proposed`
  - `running`
  - `awaiting_review`
  - `blocked`
  - `completed`
  - `failed`
- safe one-click execution for low-risk actions already supported by the product
- richer section-level assistant cards in Worklist, Drafts, Planning, Approvals, and Backups
- matching assistant queue reads in the CLI and local HTTP API

### Guardrails

- no send
- no restore
- no approval decisions from the assistant queue
- no auth mutation
- no broad new browser permissions
- all high-trust actions still keep explicit CLI handoff

### Success target

The operator opens the console and sees:

- what the assistant is doing now
- what is ready to review
- what safe actions can run immediately
- which CLI command still applies for anything intentionally outside browser scope

## Phase 2

Phase 2 is now complete.

Delivered shape:

- grouped reply and follow-up blocks
- assistant-prepared draft staging with provenance reuse
- grouped draft review in the console
- browser-safe review handling plus approval request handoff
- workflow bundles that prefer staged inbox work over raw thread inspection
- send and approval decisions still review-gated outside browser execution

## Phase 3

Phase 3 is now complete.

Delivered shape:

- meeting-prep packets with agenda draft, prep checklist, and open questions
- explicit-docs-first meeting context with related thread, task, and recommendation attachment
- `prep-meetings --event <eventId>` packet detail plus `--prepare` refresh
- console `Today's Prep` and worklist packet detail with one-click packet preparation
- assistant queue and workflow ranking that can prefer real packet-ready meeting prep when it truly matters
- attendee communication and send still gated outside browser execution

## Phase 4

Phase 4 is now complete.

Delivered shape:

- a macOS-only Tauri desktop shell under `desktop/`
- the same daemon, local HTTP API, and console UI inside a native webview
- `personal-ops install desktop`, `personal-ops desktop open`, and `personal-ops desktop status`
- operator-only `POST /v1/console/session` for native session handoff
- tray or menu bar controls for open, refresh session, readiness, and now-next summary
- bounded native notifications for readiness degradation, assistant review growth, and new approval pressure
- local unsigned `.app` install at `~/Applications/Personal Ops.app`
- unchanged trust boundaries for send, approval decisions, restore, auth mutation, and destructive actions

## Phase 5

This phase should expand Google context only where it materially improves assistant execution.

Expected direction:

- narrow Google Sheets context for planning or project visibility
- richer related-file grouping in Drive scope
- stronger doc-aware meeting prep and workflow bundles

## Preserve Across Compaction

- this file is the canonical roadmap for the assistant-led initiative
- Phases 1, 2, 3, and 4 are complete
- every completed phase should have a plan doc and a rollout doc
- the intended product direction is:
  - less manual operator work
  - more prepared assistant actions
  - console first
  - optional desktop wrapper for daily use
  - trust boundaries still explicit for risky actions
