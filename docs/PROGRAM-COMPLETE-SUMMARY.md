# personal-ops Program Complete Summary

Date: 2026-03-25
Status: Historical snapshot through Phase 33

Current source of truth: `docs/ASSISTANT-LED-ROADMAP.md`

## Purpose of This Document

This document is the historical end-of-program summary for the full `personal-ops` delivery track through Phase 33.

It is **not** the current roadmap or current-state record anymore.

Use:

- `docs/ASSISTANT-LED-ROADMAP.md` for the live assistant-led roadmap and current phase status
- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md` for the durable historical summary of the completed assistant-led track
- the current assistant-led phase plan and rollout docs for implementation truth and shipped closeout details

It is meant to answer five questions in one place:

1. What `personal-ops` is.
2. What the final supported system now does.
3. How the operator-versus-assistant trust model works.
4. What each phase of the program added or clarified.
5. Why the program is considered complete for now.

This summary complements, rather than replaces:

- `README.md` for the current product shape
- `docs/ASSISTANT-LED-ROADMAP.md` for the current and future roadmap truth
- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md` for the historical assistant-led Phases 1 through 38 story
- `CLIENTS.md` for the shared client contract
- `docs/2026-03-24-system-audit.md` for the full system audit and live verification record
- the individual `PHASE-*-PLAN.md` and `PHASE-*-ROLLOUT.md` files for implementation history

## Beginner Explanation

If someone has no idea what `personal-ops` is, the simplest explanation is:

`personal-ops` is a private control system for your personal workflow.

It sits between:

- your real tools, like Gmail and Google Calendar
- your assistants, like Codex and Claude
- and your real decisions, like whether to send something, schedule something, or change system policy

It is not:

- an AI that takes over your accounts
- a random collection of scripts
- a chatbot pretending to remember things

It is:

- one local daemon
- one local database
- one shared source of truth for inbox, task, calendar, planning, and audit state
- one safety layer that lets assistants help without giving them unlimited power

The beginner version is:

“it is a smart safety wrapper around your personal workflow.”

### Why it exists

Without this layer, each assistant would need to invent its own:

- mailbox logic
- calendar logic
- task logic
- approval logic
- audit logic
- safety rules

That would create duplication, inconsistency, and trust problems.

`personal-ops` solves that by centralizing the workflow state and exposing one shared control plane.

### What it actually does

At a high level, the system:

- syncs mailbox and calendar state into a local machine-owned view
- stores drafts, tasks, suggestions, planning recommendations, approvals, and audit history
- derives useful operational context from that state
- gives assistants safe read access to supported views
- keeps risky or externally mutating actions behind operator control

### A concrete example

Suppose an inbox thread needs a reply.

The system can:

- notice the thread through sync
- mark it as needing attention
- generate a planning recommendation like “set aside time to reply”
- show that recommendation to an assistant
- let the assistant explain the recommendation or help prioritize it

But the assistant still does not get to:

- send the email on its own
- freely mutate the calendar
- change policy-governance decisions

That separation is the heart of the design.

### The trust model in one sentence

Assistants can help; the operator stays in charge.

## Program Verdict

The Phase 1 through Phase 33 program is complete.

The final result is a stable, machine-level shared control plane with:

- one local source of truth for mail-adjacent workflow, inbox awareness, tasks, calendar awareness, planning, governance, and audit
- one operator authority model for risky or externally mutating actions
- one assistant-safe read model for shared operational context
- one explicit steady-state governance and audit surface baseline
- no currently justified Phase 34 implementation backlog

The current posture after Phase 33 is:

- no planned governance-surface work
- no planned audit-surface work
- no expansion of assistant reach unless future real usage evidence shows a concrete pain point

## What personal-ops Is

`personal-ops` is a neutral machine-level service that centralizes operational state for one operator and multiple assistants on the same Mac.

It is not:

- a repo-local helper
- a one-off script
- an assistant-owned workflow layer
- a free-for-all automation engine

It is:

- a local daemon on `127.0.0.1:46210`
- a local SQLite-backed state system
- a shared CLI, HTTP, and MCP control plane
- a trust-boundary enforcement layer
- a coordination layer for inbox, task, calendar, planning, and governance state

Core runtime pieces:

- local daemon process
- LaunchAgent-managed persistence
- local SQLite database
- local config and policy files
- operator CLI
- assistant MCP access for Codex and Claude

## Final System Scope

By the end of Phase 33, the system supports:

### Mail and review

- Gmail installed-app OAuth setup
- draft create and update
- approval-gated send flow
- explicit review queue and approval queue
- operator-issued confirmation tokens for approve/send from MCP
- dark-launch and timed-window send controls

### Inbox awareness

- metadata-only mailbox sync
- thread index and derived thread-state views
- unread, stale, and reply-needed awareness
- inbox-aware worklist pressure
- mailbox health and sync reporting

### Tasks and suggestions

- internal tasks stored in local SQLite
- assistant-safe task suggestions
- operator task lifecycle management
- task-aware reminders and worklist integration

### Calendar awareness and mutation

- metadata-only Google Calendar indexing
- bounded rolling-window event sync
- conflict and overload visibility
- operator-only calendar writes on owned calendars
- task-to-calendar scheduling with provenance and etag safety

### Planning system

- durable planning recommendations
- recommendation ranking and grouped planning views
- next-action, backlog, closure, and throughput reporting
- grouped planning reads plus low-risk grouped operator actions
- operator apply/reject/snooze/replan controls
- assistant-safe planning reads and explanation surfaces

### Hygiene, policy, and governance

- advisory hygiene reporting
- operator hygiene review loop
- operator-only hygiene policy proposals
- explicit policy-governance history
- grouped policy-history summaries
- recent exits, retention candidates, and governance watchlist reporting
- detailed operator-only `recommendation policy`
- compact aligned policy attention in `status` and `worklist`

### Assistant-safe audit

- least-privilege categorized audit feed
- sanitized summaries and sanitized metadata
- optional single-category filter for:
  - `sync`
  - `task`
  - `task_suggestion`
  - `planning`
- unchanged raw operator audit

## Final Trust Model

The trust model is one of the most important outcomes of the whole program.

### Operator capabilities

The operator owns risky and externally mutating behavior, including:

- send approval and send execution
- review opening
- calendar event writes
- task commitment
- planning recommendation apply/reject/snooze/replan
- grouped planning mutations
- hygiene review mutation
- hygiene proposal mutation
- policy archive, supersede, and prune mutation
- raw policy-governance reporting
- raw operator audit reads

### Assistant capabilities

Assistants are clients of `personal-ops`, not owners of provider logic.

Assistants can safely read:

- status
- doctor
- worklist
- inbox metadata-derived views
- task and task-suggestion reads allowed by contract
- planning recommendation reads
- grouped planning summaries
- summary/backlog/closure/hygiene/tuning reads that are explicitly assistant-safe
- assistant-safe audit reads

Assistants can suggest:

- task suggestions
- manual planning recommendations

Assistants cannot:

- send mail directly
- approve or send without operator-issued confirmation
- mutate raw policy governance
- open reviews
- apply/reject/snooze/replan recommendations
- mutate grouped planning state
- write calendar events directly
- read raw operator-only policy history
- bypass audit shaping

### Trust-model design principle

The service keeps one shared operational state, but not one shared authority level.

That distinction is what allowed the product to become more capable without becoming unsafe.

## Final Supported Surface Map

At the end of the program, the supported steady-state surfaces are:

### `recommendation policy`

- operator-only
- detailed governance surface
- active backlog, recent exits, grouped history, raw recent events, and retention candidates
- primary place to inspect policy/governance detail

### `status`

- compact health and primary attention surface
- one primary policy-attention line
- not a secondary governance dashboard

### `worklist`

- one-at-a-time attention surface
- prioritizes actionable pressure
- not a full analytics or governance dashboard

### assistant-safe audit

- categorized operational context feed
- least-privilege shaping
- optional single-category filter
- not a raw audit browser

### hygiene and tuning

- assistant-safe explanatory planning reads
- not governance-control surfaces

## Program History by Phase

This section captures the meaningful delivery arc from Phase 1 through Phase 33.

### Foundation: Phase 1 through Phase 7

#### Phase 1

Established the service foundation:

- daemon
- SQLite state
- Gmail OAuth
- draft create/update
- review queue
- Notification Center alerts
- CLI and Codex MCP access

#### Phase 1.5

Added operator visibility and recovery basics:

- `status`
- `doctor`
- review detail commands
- filtered human-readable audit output
- snapshots for recovery

#### Phase 2

Introduced approval-gated send:

- explicit approval queue states
- draft send through Gmail drafts API
- operator-issued confirmation tokens for MCP approve/send
- send gating through `allow_send`

#### Phase 2.5

Improved supervised operations:

- timed send windows
- worklist as the main attention surface
- recovery commands for failed approval and stale review state
- daemon reminder sweeps

#### Phase 2.6 and Phase 3

Expanded into inbox awareness:

- operator-only review open
- non-mutating health/status/worklist/approval reads
- daemon-owned runtime normalization
- metadata-only inbox sync
- local mailbox state and thread indexing
- inbox-aware status and worklist reporting

#### Phase 4

Made the system truly shared across assistants:

- assistant-specific MCP identity headers
- explicit shared client contract
- Claude parity with the shared workflow
- clear statement that assistants are clients, not provider owners

#### Phase 5

Added internal task management:

- local tasks and reminders
- separate assistant-safe suggestion queue
- task-aware worklist and reminder behavior
- operator task flows through CLI/HTTP

#### Phase 6

Added calendar awareness:

- metadata-only Google Calendar read model
- rolling-window calendar indexing
- calendar-aware worklist pressure
- operator calendar views and assistant-safe calendar reads

#### Phase 7

Added operator-controlled calendar mutation and scheduling:

- operator-only event create/update/cancel
- task-to-calendar scheduling
- event provenance and etag safety
- scheduling-aware worklist items
- calendar write readiness checks

### Planning Platform: Phase 8 through Phase 14

#### Phase 8

Created the planning recommendation layer:

- durable planning recommendations
- system-owned recommendation refresh
- operator apply/reject/snooze/refresh
- assistant-safe planning reads
- worklist/status integration that prefers high-level planning state

#### Phase 9

Made planning ranked and explainable:

- deterministic ranking
- grouped planning summaries
- richer explanation and provenance
- operator-only replan
- startup schema compatibility preflight

#### Phase 10

Made planning execution more realistic:

- outcome tracking
- slot-state tracking
- collision-aware grouped planning
- grouped recommendation reads
- low-risk grouped operator actions
- worklist shaping to avoid duplicate noise

#### Phase 11

Completed planning reporting:

- first-action and closure analytics
- summary, backlog, and closure reports
- throughput context
- richer grouped detail

#### Phase 12

Separated active work from history and tuned ranking conservatively:

- active-versus-history counts
- filtered backlog and closure analytics
- group-level closure mix
- derived ranking calibration from recent outcomes
- planning hygiene summaries

#### Phase 13

Introduced advisory hygiene:

- recommendation hygiene reporting
- queue-share and dominance visibility
- suppression-candidate summaries
- better closure-meaning summaries
- no new mutation surface

#### Phase 14

Completed the operator hygiene review loop:

- audit-derived review state
- operator-only hygiene review mutation
- assistant-safe `review_needed_only`
- review-needed counts in status and summary
- worklist pressure for hygiene review

### Governance and Audit Maturation: Phase 15 through Phase 20

#### Phase 15

Added explicit hygiene policy proposals:

- operator-only family-scoped proposals
- follow-through states
- tuning reads
- operator-only proposal record/dismiss mutation
- schema upgrade to `13`

#### Phase 16

Improved tuning and assistant-safe redaction:

- active attention family triage
- compact recent closed-family history for operators
- assistant-safe redaction for proposal note and attribution
- follow-through worklist pressure limited to meaningful states

#### Phase 17

Added explicit policy-governance history:

- append-only policy governance events
- operator-only `recommendation policy`
- operator-only archive and supersede mutation
- schema upgrade to `14`
- stronger assistant-safe planning-history redaction

#### Phase 18

Added assistant-safe audit and policy retention controls:

- least-privilege audit shaping
- operator-only policy prune
- richer cross-horizon policy reporting
- compact policy-governance counts in status
- policy-governance worklist pressure

#### Phase 19

Added grouped policy-history interpretation:

- grouped policy-history summaries
- repeated-family and mixed-outcome counts
- governance hygiene watchlist
- `policy_history_recent_events` as the raw drill-down field
- temporary `policy_history` compatibility alias

#### Phase 20

Stabilized governance attention and assistant-safe audit categorization:

- explicit assistant-safe audit categories
- shared policy registry for safe summaries and metadata
- policy-attention fields on `recommendation policy`
- simplified compact policy attention in `status` and `worklist`
- one more phase of compatibility for the deprecated alias

### Compatibility Cleanup and Supported-Baseline Confirmation: Phase 21 through Phase 30

#### Phase 21

- removed deprecated `policy_history` alias
- kept `policy_history_recent_events` as the only raw drill-down field

#### Phase 22

- removed deprecated compact policy status summary fields
- kept compact policy attention centered on the primary fields only

#### Phase 23

- consolidated policy-attention derivation internally
- explicitly treated the current governance surface as the supported baseline

#### Phase 24

- kept machine-readable compact counts
- made human-readable `status` calmer and less dashboard-like

#### Phase 25

- removed the remaining compact policy counts from `status`
- left compact governance signaling centered on `policy_attention_kind` and `top_policy_attention_summary`

#### Phase 26

- strengthened cross-surface proof
- documented the supported baseline more explicitly

#### Phase 27

- simplified human-readable `recommendation policy` wording
- kept the same detailed sections and order

#### Phase 28

- reviewed the live surface under real usage
- made one small evidence-backed wording cleanup

#### Phase 29

- suppressed empty cue rows in human-readable `recommendation policy`
- kept all machine-readable surfaces unchanged

#### Phase 30

- performed a no-code-change stability review
- confirmed no more governance-surface work was justified

### Audit Ergonomics and Evidence Closure: Phase 31 through Phase 33

#### Phase 31

Added the one narrow audit ergonomics improvement that evidence justified:

- optional single-category filter on existing audit reads
- categories limited to existing safe categories
- same default feed
- same safe event set
- same operator raw audit behavior

#### Phase 32

Confirmed that the new filter was sufficient:

- live HTTP and MCP review
- default feed plus optional single-category filter judged sufficient
- no broader query surface justified

#### Phase 33

Re-validated that conclusion at broader slices:

- `limit=5` and `limit=20` review across HTTP and MCP
- explicit classification of the outcome
- verdict: `sufficient`
- no runtime change justified

## Final Architectural Themes

Across all 33 phases, the program consistently moved in these directions:

### 1. Shared source of truth

The system moved provider logic, operational state, and audit trails into one shared service instead of leaving them scattered across assistant-specific logic.

### 2. Suggestion-first assistant posture

Assistants gained visibility and safe recommendation capabilities, but risky state changes remained operator-controlled.

### 3. Derived reporting before mutation

Many phases added reporting, summaries, and attention shaping before or instead of new mutation surfaces.

### 4. Explicit governance instead of hidden automation

The hygiene and policy layers were deliberately non-enforcing and reviewable. The system avoided hidden suppression, auto-hide behavior, or silent recommendation execution.

### 5. Compatibility cleanup without surprise

Later phases removed deprecated governance and status fields only after the replacement surfaces were already stable and verified.

### 6. Evidence before expansion

The final audit phases only added or retained behavior that live evidence justified. That is why the program ended with a no-more-planned-work posture.

## Current Supported Baseline in Detail

At program completion, the supported baseline is:

### Mail

- draft create/update
- review queue
- approval queue
- approval-gated send
- timed send windows

### Inbox

- metadata-only sync
- thread indexing
- unread and reply-needed context

### Tasks

- internal tasks
- assistant-safe suggestions
- reminders and due-state reporting

### Calendar

- metadata-only read model
- operator-only writes
- task-to-calendar scheduling

### Planning

- durable ranked recommendations
- grouped reads
- operator-only execution mutation
- assistant-safe explanation and analytics reads

### Governance

- operator-only detailed governance
- compact aligned attention surfaces
- non-enforcing policy history and follow-through

### Audit

- assistant-safe categorized feed
- optional single-category filter
- raw operator audit

## What Was Deliberately Not Added

The program is also defined by what it deliberately did not introduce.

Still out of scope unless a future evidence-backed plan changes them:

- direct assistant calendar writes
- automatic recommendation execution
- hidden suppression rule engines
- automatic hiding of recommendations
- guest invite workflows
- Meet link management
- recurring calendar event scheduling
- broader audit query dimensions beyond the supported single-category filter
- trust-boundary shortcuts for convenience

## Verification and Delivery Discipline

This program did not finish with a speculative claim of completeness. It finished with repeated verification and a live-machine audit trail.

Program-level delivery discipline included:

- schema compatibility checks
- repeated `npm test` reruns after final patch sets
- repeated `npm run typecheck`
- live `status` and `doctor` checks
- live CLI, HTTP, and MCP verification
- explicit rollout records per phase
- snapshots before risky restarts or rollouts

Final steady-state indicators at program close:

- schema `14`
- ranking `phase12-v1`
- daemon ready
- deep doctor healthy
- supported audit model verified
- supported governance model verified
- no remaining blocking issues

## Documentation Map

The best current reading order is:

1. `README.md`
2. `CLIENTS.md`
3. `docs/PROGRAM-COMPLETE-SUMMARY.md`
4. `docs/2026-03-24-system-audit.md`
5. individual phase plan/rollout files when implementation history is needed

Primary source-of-truth artifacts:

- `README.md`
- `CLIENTS.md`
- `docs/PROGRAM-COMPLETE-SUMMARY.md`
- `docs/2026-03-24-system-audit.md`

Detailed implementation history:

- `docs/PHASE-8-HANDOFF.md`
- `docs/PHASE-9-PLAN.md` through `docs/PHASE-33-ROLLOUT.md`

## Why the Program Is Complete

The program is complete because:

- the system has a clear supported baseline
- the trust model is explicit and stable
- the governance surfaces are aligned and quiet enough
- the audit surface is useful and intentionally limited
- the remaining asks are hypothetical rather than evidence-backed
- Phase 33 ended with a `sufficient` verdict rather than a deferred defect

The right default posture after this document is:

- keep the current system stable
- use the existing docs as the source of truth
- only reopen delivery if fresh usage evidence shows a concrete new problem
