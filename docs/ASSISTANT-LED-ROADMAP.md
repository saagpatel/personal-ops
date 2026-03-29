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
| 5 | Broader Google Context | Expand Google context where it materially improves planning, meeting prep, and workflow bundles | Complete |
| 6 | Planning Autopilot and Execution Bundles | Turn planning recommendations into prepared grouped execution work with explicit console apply | Complete |
| 7 | Approval Autopilot and Outbound Finish-Work | Move reviewed outbound mail work through grouped request-approval, approve, and send in the console | Complete |

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

Phase 5 is now complete.

Delivered shape:

- narrow cached Google Sheets previews inside the existing Drive scope
- richer related-file grouping with explicit links first, shared-parent files second, and small recent fallback last
- `personal-ops drive sheet <fileId>` plus `GET /v1/drive/sheets/:fileId`
- assistant-safe MCP `drive_sheet_get`
- meeting prep, day-start, now-next, and worklist detail can attach `Related Files` instead of only docs
- Drive status now reports indexed sheet counts
- no browser mutation expansion, no Google writes, no Slides extraction, and no Shared Drives support

## Phase 6

Phase 6 is now complete.

Delivered shape:

- `personal-ops planning autopilot` plus bundle detail, prepare, and apply flows
- at most three active planning bundles across task blocks, follow-up work, and meeting prep
- proactive bundle preparation when readiness is healthy
- reuse of inbox autopilot groups and meeting prep packets as upstream prep layers
- console-first Planning bundle review with prepared note, execution preview, linked artifacts, and grouped apply
- workflow ranking that now points to prepared bundles instead of raw planning translation when a bundle is the real execution layer
- grouped apply remains explicit, note-required, confirmation-gated, and audit-logged

## Phase 7

Phase 7 is now complete.

Delivered shape:

- `personal-ops outbound autopilot` plus grouped outbound detail, request-approval, approve, and send flows
- outbound groups derived from reviewed inbox autopilot work first, with singleton fallback for orphan approval items
- console-first outbound finish-work across Overview, Drafts, and Approvals
- grouped approve and grouped send that reuse the existing per-approval confirmation and send machinery
- explicit send-window blocked state with CLI handoff instead of browser-side send-window control
- no silent approval, no silent send, and no widening of auth, restore, or destructive mutation scope

## Preserve Across Compaction

- this file is the canonical roadmap for the assistant-led initiative
- Phases 1, 2, 3, 4, 5, 6, and 7 are complete
- every completed phase should have a plan doc and a rollout doc
- the intended product direction is:
  - less manual operator work
  - more prepared assistant actions
  - console first
  - optional desktop wrapper for daily use
  - trust boundaries still explicit for risky actions
