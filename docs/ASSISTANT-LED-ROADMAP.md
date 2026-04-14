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

## Current Shipped Baseline

The currently shipped assistant-led baseline is:

- Phases 1 through 34 complete
- Cluster A complete:
  - Phases 24, 25, and 26 shipped together as the maintenance-maturity cluster
- Cluster B complete:
  - Phases 27, 28, and 29 shipped together as the workspace-intelligence-and-maturity cluster
- the post-Cluster-B stabilization pass is merged
- the Phase 30 usefulness-proof slice is merged
- the Phase 31 cross-surface noise-reduction slice is merged
- the Phase 32 review/approval handoff ergonomics slice is merged
- the Phase 33 review outcome calibration slice is merged
- the Phase 34 review surface adjustment proof slice is merged
- this assistant-led roadmap remains separate from the older legacy `PHASE-*` governance track

The next assistant-led target is:

- Phase 35: Review Surface Stability Check
- status: Planned
- focus:
  - validate whether the new proof-gated supporting explanation is actually stabilizing the review/approval handoff
  - prefer stability and evidence over another wording pass unless the same gap keeps repeating
  - preserve the same bounded trust and authority model while deciding whether any further surface work is justified

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
| 8 | Continuous Autopilot, Warm Start, and Value Review | Warm the existing assistant-led workspace in the background and prove the value of that prep layer | Complete |
| 9 | Review Intelligence 2.0 | Compress prepared work into bounded review packages and add review-only tuning without altering core ranking | Complete |
| 10 | Review Outcomes, Eval Loop, and Notification Governance | Measure whether review packages and review notifications are actually paying off, and expose that evidence to the operator | Complete |
| 11 | Review Trends, Tuning Impact, and Weekly Operator Review | Turn rolling review outcomes into trend, comparison, and weekly operator guidance without widening trust boundaries | Complete |
| 12 | Outcome-Driven Review Calibration | Turn review reports into target-vs-actual calibration without widening authority | Complete |
| 13 | Desktop Platform Hardening | Make the macOS desktop support contract explicit, durable, and cheaper to maintain | Complete |
| 14 | Desktop Install Reliability and CI Stability | Make wrapper repair, desktop diagnostics, and platform-safe CI checks line up with the macOS-only desktop contract | Complete |
| 15 | Guided Local Repair and Repair Plans | Turn local diagnostics into one deterministic repair plan with narrow CLI execution | Complete |
| 16 | Repair Outcome Tracking and Drift Prevention | Record whether safe repairs worked and highlight recurring local drift before it becomes noise | Complete |

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

## Phase 8

Phase 8 is now complete.

Delivered shape:

- `personal-ops autopilot status` plus operator-triggered autopilot runs
- `GET /v1/autopilot/status` for the console and desktop shell, with operator-only run routes for manual refresh
- one continuous coordinator that warms day-start, inbox, meetings, planning, and outbound surfaces
- stale-while-refresh freshness tracking with per-profile run state and additive persistence
- console and desktop warm-start summaries over the same autopilot state
- additive autopilot provenance on prepared drafts and meeting packets
- completed-work review that now summarizes the full assistant-led program through Phase 8

## Phase 9

Phase 9 is now complete.

Delivered shape:

- one bounded derived review package per surface across inbox, meetings, planning, and outbound work
- stable review package identity based on source identity and underlying state instead of presentation copy
- persisted review read-model freshness with single-flight refresh behavior
- operator-only package and item-level feedback
- audit-safe review tuning approvals and dismissals that preserve evidence snapshots
- console and desktop review overlay support without hiding the raw worklist
- explicit proof in tests that review intelligence remains an overlay and never becomes a ranking source

## Phase 10

Phase 10 is now complete.

Delivered shape:

- review package cycle history so reporting is based on real package lifecycles instead of stable package ids alone
- review notification telemetry that records both fired and suppressed review notification decisions
- `personal-ops review report` plus `GET /v1/review/report`
- console review report rendering with summary, per-surface breakdowns, noisy-source reporting, and tuning outcome context
- additive status metrics for 14-day review outcomes and notification conversion
- test coverage for package-cycle reporting, legacy feedback attribution, and desktop review notification telemetry
- unchanged trust boundaries:
  - no automatic tuning approval
  - no new core workflow ranking source
  - no widening of browser mutation authority
  - no change to send, approval, auth, or restore controls

## Phase 11

Phase 11 is now complete.

Delivered shape:

- persisted daily review metric snapshots for global and per-surface trend history
- `personal-ops review trends`, `personal-ops review impact`, and `personal-ops review weekly`
- `GET /v1/review/trends`, `GET /v1/review/impact`, and `GET /v1/review/weekly`
- console Review Trends surface with week-over-week deltas, noisy sources, recent tuning impact, and operator recommendations
- additive status deltas for review trend movement without expanding the compact status footprint
- comparison reporting for approved review tuning so the operator can see before-and-after effect without any automatic policy changes
- unchanged trust boundaries:
  - no automatic tuning approval
  - no automatic rollback or reconfiguration
  - no new core workflow ranking source
  - no widening of browser mutation authority

## Phase 12

Phase 12 is now complete.

Delivered shape:

- persisted review calibration targets with global defaults and optional per-surface overrides
- `personal-ops review calibration` plus `GET /v1/review/calibration`
- operator-only calibration target reads and edits through CLI and HTTP
- console Review Calibration surface with target-vs-actual scorecards, noisy sources, recent tuning effect, and manual recommendations
- additive compact status for calibration posture, off-track surfaces, notification budget pressure, and top calibration surface
- deterministic calibration recommendations without automatic proposal generation or policy mutation
- unchanged trust boundaries:
  - no automatic tuning approval or rollback
  - no new review source in the core workflow ranking engine
  - no browser mutation path for calibration targets
  - no widening of send, approval, auth, or restore controls

## Phase 13

Phase 13 is now complete.

Delivered shape:

- explicit `macos_only` desktop support contract in desktop status and install reporting
- persisted desktop build provenance for build time, source commit, Vite version, and Tauri CLI/runtime versions
- reinstall recommendations when the installed app is stale relative to the current checkout
- dedicated `personal-ops` desktop dependency verification through `npm run verify:desktop-platform`
- executable policy that treats unsupported Linux GTK3/WebKit transitive findings as informational noise for this macOS-only phase
- durable desktop support guidance in `docs/ASSISTANT-LED-DESKTOP-SUPPORT-CONTRACT.md`
- unchanged trust boundaries:
  - desktop shell remains optional
  - no new browser mutation authority
  - LaunchAgent remains the startup path
  - no change to send, approval, auth, restore, or ranking controls

## Phase 14

Phase 14 is now complete.

Delivered shape:

- explicit wrapper provenance in the install manifest, including source commit, pinned Node executable, and wrapper targets
- `personal-ops install wrappers` for focused launcher repair without reinstalling the full local stack
- install check and doctor guidance that distinguishes wrapper drift from desktop-app drift
- desktop status and desktop open behavior that separates launcher repair from desktop reinstall
- platform-aware desktop test helpers so non-macOS CI keeps validating the macOS-only contract without reintroducing stale assumptions
- refreshed desktop support guidance that explains when to use wrapper repair, desktop reinstall, or full install refresh
- unchanged trust boundaries:
  - desktop shell remains optional and macOS-only
  - no new browser mutation authority
  - no new HTTP or MCP API surface
  - no change to send, approval, auth, restore, or ranking controls

## Phase 15

Phase 15 is now complete.

Delivered shape:

- one shared repair plan across doctor, status, health check, install check, and desktop status
- `personal-ops repair plan` for the deterministic local repair sequence
- `personal-ops repair run <stepId|next>` for the narrow safe subset of executable local repairs
- status, doctor, health, install check, desktop status, and console now agree on the same first repair step
- repair guidance now prefers targeted fixes before broader reinstall advice
- unchanged trust boundaries:
  - repair execution stays CLI-only
  - browser and console remain read-only for repair
  - no new HTTP or MCP APIs
  - no change to send, approval, auth, restore, or ranking controls

## Phase 16

Phase 16 is now complete.

Delivered shape:

- local SQLite repair execution history for safe repair steps and direct safe install repairs
- before-and-after repair outcome recording with `resolved`, `still_pending`, and `failed`
- additive repair-memory summaries across status, doctor, health, install check, desktop status, and console
- recurring-drift detection over a 30-day window with fixed prevention hints for wrappers, desktop app drift, LaunchAgent drift, and secret permissions drift
- repair run output that now says whether the targeted issue was actually cleared and what remains if it was not
- unchanged trust boundaries:
  - repair execution stays CLI-only
  - browser and console remain read-only for repair
  - no new HTTP or MCP APIs
  - no change to send, approval, auth, restore, or ranking controls

## Phase 17

Phase 17 is now complete.

Delivered shape:

- preventive-maintenance recommendations derived from repeated safe repair history
- additive preventive summaries across status, doctor, health, install check, desktop status, repair plan, and console
- a 24-hour quiet period after a fresh resolved safe repair so preventive guidance stays quieter than active repair steps
- repair run output that can now add a short preventive follow-up note when a resolved safe repair keeps repeating
- unchanged trust boundaries:
  - preventive maintenance remains guidance only
  - repair execution stays CLI-only
  - browser and console remain read-only for repair
  - no new HTTP or MCP APIs
  - no change to send, approval, auth, restore, or ranking controls

## Phase 18

Phase 18 is now complete.

Delivered shape:

- a derived calm-window `maintenance_window` summary on top of Phase 17 preventive-maintenance guidance
- bounded preventive maintenance bundles across `worklist`, `now`, `prep-day`, status payloads, and the console repair area
- deterministic suppression when active repair is pending, the system is not ready, the quiet period is still active, or concrete operator work is already present
- `prep-day` maintenance bundles that stay separate from `Next Commands` so repair and concrete work still lead
- unchanged trust boundaries:
  - preventive maintenance remains guidance only
  - no new CLI repair commands were added
  - repair execution stays CLI-only
  - browser and console remain read-only for maintenance guidance
  - no new HTTP or MCP APIs
  - no change to send, approval, auth, restore, or ranking controls

## Phase 19

Phase 19 is now complete.

Delivered shape:

- a derived CLI-only maintenance session built directly from the existing calm-window maintenance bundle
- `personal-ops maintenance session` for the current session preview or deferred reason
- `personal-ops maintenance run next` for one safe maintenance step at a time
- maintenance execution recorded in existing repair history as `maintenance_run`
- calm-window read surfaces now point to the session start command without displacing repair or concrete work
- unchanged trust boundaries:
  - maintenance execution stays CLI-only
  - browser and console remain read-only
  - no new HTTP or MCP APIs
  - no new persistence beyond the existing repair execution history
  - no change to send, approval, auth, restore, or ranking controls

## Phase 20

Phase 20 is now complete.

Delivered shape:

- a derived maintenance follow-through summary layered onto the existing maintenance window and maintenance session model
- deterministic maintenance outcome signals for completed, advanced, handed-off, failed, deferred, and stale resurfacing bundles
- additive maintenance-pressure summaries across `status`, `worklist`, `now`, `prep-day`, `repair plan`, `maintenance session`, and the console
- stronger guidance when the same calm-window bundle keeps resurfacing or repeatedly turns into repair
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new maintenance commands
  - maintenance still stays behind active repair and concrete work

## Phase 21

Phase 21 is now complete.

Delivered shape:

- a derived `maintenance_escalation` summary layered onto the existing maintenance follow-through model
- promotion limited to repeated `handed_off_to_repair` patterns for safe maintenance families only
- one bounded queue-visible cue:
  - `AttentionItem.kind = "maintenance_escalation"`
  - severity `warn`
  - command `personal-ops maintenance session`
- additive escalation visibility across `status`, `worklist`, `now`, `prep-day`, `repair plan`, `maintenance session`, and the console
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new maintenance commands
  - no planning-recommendation or task creation path
  - maintenance still stays behind active repair and urgent concrete work

## Phase 22

Phase 22 is now complete.

Delivered shape:

- a derived `maintenance_scheduling` summary layered onto the existing maintenance window and escalation model
- deterministic placement for the top maintenance cue:
  - `now`
  - `prep_day`
  - `calm_window`
  - `suppressed`
- additive timing visibility across `status`, `worklist`, `now`, `prep-day`, `repair plan`, `maintenance session`, and the console
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
- no new maintenance commands
- maintenance still stays behind active repair and urgent concrete work

## Phase 23

Phase 23 is now complete.

Delivered shape:

- a small local `maintenance_commitments` memory source to track scheduled maintenance commitments and repeated deferral
- commitment state limited to:
  - `active`
  - `completed`
  - `handed_off_to_repair`
  - `superseded_by_repair`
  - `expired`
- additive commitment and defer-memory summaries across `status`, `worklist`, `now`, `prep-day`, `repair plan`, `maintenance session`, and the console
- commitment creation limited to scheduled maintenance placed in:
  - `now`
  - `prep_day`
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
- no new maintenance commands
- no planning-recommendation, task, or automation creation path
- active repair and urgent concrete work still outrank maintenance

## Phase 24

Phase 24 is now complete.

Delivered shape:

- a derived `maintenance_confidence` summary layered onto commitment, defer-memory, escalation, scheduling, and repair-execution history
- descriptive confidence tiers only:
  - `low`
  - `medium`
  - `high`
- descriptive confidence trends only:
  - `rising`
  - `steady`
  - `cooling`
- additive confidence visibility across:
  - `status`
  - `worklist`
  - `now`
  - `prep-day`
  - `repair plan`
  - `maintenance session`
  - the console
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new maintenance commands
  - no change to repair-first or urgent-work-first precedence

## Phase 25

Phase 25 is now complete.

Delivered shape:

- a derived `maintenance_operating_block` summary layered onto the existing maintenance scheduling and confidence model
- descriptive operating blocks only:
  - `current_block`
  - `later_today`
  - `calm_window`
  - `suppressed`
- additive operating-block visibility across:
  - `status`
  - `worklist`
  - `now-next`
  - `prep-day`
  - `repair plan`
  - `maintenance session`
  - the console
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no saved planning state
- no new maintenance commands
- no change to repair-first or urgent-work-first precedence

## Phase 26

Phase 26 is now complete.

Delivered shape:

- a derived `maintenance_decision_explanation` summary layered onto follow-through, commitment, defer-memory, confidence, operating-block, and scheduling state
- descriptive explanation states only:
  - `do_now`
  - `budget_today`
  - `calm_window`
  - `suppressed`
- descriptive explanation drivers only:
  - `commitment`
  - `escalation`
  - `confidence`
  - `operating_block`
  - `scheduling`
  - `repair_blocked`
  - `readiness_blocked`
- additive explanation visibility across:
  - `status`
  - `worklist`
  - `now-next`
  - `prep-day`
  - `repair plan`
  - `maintenance session`
  - the console
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new maintenance commands
  - no change to repair-first or urgent-work-first precedence

## Phase 27

Phase 27 is now complete.

Delivered shape:

- a derived `workflow_personalization` summary layered onto existing planning-recommendation history, workflow candidates, readiness state, and configured workday hours
- descriptive personalization categories only:
  - `task`
  - `followup`
  - `meeting`
- descriptive preference windows only:
  - `early_day`
  - `mid_day`
  - `late_day`
  - `anytime`
- descriptive fit states only:
  - `favored`
  - `neutral`
  - `defer`
- additive personalization visibility across:
  - `workflow now-next`
  - `workflow prep-day`
  - assistant top-action emphasis
  - console workflow and assistant surfaces
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new commands
  - no change to repair-first or urgent-work-first precedence
  - no change to core worklist ordering

## Phase 28

Phase 28 is now complete.

Delivered shape:

- a derived `maintenance_repair_convergence` summary layered onto the existing repair plan, maintenance follow-through, escalation, commitment, confidence, operating-block, and decision-explanation state
- descriptive convergence states only:
  - `repair_owned`
  - `repair_priority_upkeep`
  - `maintenance_owned`
  - `quiet_preventive`
  - `none`
- additive convergence visibility across:
  - `status`
  - `worklist`
  - `repair plan`
  - `maintenance session`
  - `workflow now-next`
  - `workflow prep-day`
  - the console
- active repair remains the single owner when the same recurring family is already in repair
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new maintenance commands
  - no new queue kinds
  - no change to repair-first or urgent-work-first precedence
  - no change to core worklist ordering

## Phase 29

Phase 29 is now complete.

Delivered shape:

- a derived `workspace_home` summary layered onto the existing status, assistant queue, `now-next`, and maintenance ownership signals
- descriptive workspace-home states only:
  - `repair`
  - `assistant`
  - `workflow`
  - `maintenance`
  - `caught_up`
- additive workspace-focus visibility across:
  - `status`
  - the console overview
  - the console-backed desktop shell
- calmer overview behavior:
  - one primary "what matters now" story
  - less duplicate assistant-versus-workflow explanation text
  - repair-owned maintenance stays referential instead of conflicting imperative copy
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new persistence layer
  - no new commands
- no new queue kinds
- no change to repair-first or urgent-work-first precedence
- no change to the macOS-only desktop support contract

## Current Baseline

The current shipped assistant-led baseline is:

- Phases 1 through 29 complete
- Cluster A complete
- Cluster B complete
- the post-Cluster-B stabilization pass is merged

## Phase 30

Phase 30 is now complete.

Delivered shape:

- a small `surfaced_work_outcomes` SQLite memory layer that records whether top surfaced work was actually acted on
- scope limited to top surfaced work only:
  - `workspace_home`
  - the top assistant action
  - the top `now-next` workflow action
- descriptive helpfulness summaries only:
  - `unproven`
  - `helpful`
  - `mixed`
  - `weak`
- additive surfaced-work proof across:
  - `status`
  - the console workspace focus card
  - the console-backed desktop shell
  - the top assistant action
  - `workflow now-next`
- unchanged trust boundaries:
  - no new HTTP or MCP APIs
  - no browser execution path
  - no new user-facing commands
  - no ranking or precedence changes
  - no change to repair-first or urgent-work-first precedence

## Phase 31

Phase 31 is now complete.

Delivered shape:

- use surfaced-work outcome memory from Phase 30 to reduce repeated low-value cues across the assistant-led top surfaces
- keep the phase read-model-first and bounded:
  - no new authority
  - no queue ownership changes
  - no worklist ordering changes
- apply a balanced posture:
  - deduplicate repeated workspace, assistant, and workflow wording when they point at the same work
  - quiet weak or mixed secondary cues when a clearer primary focus already exists
  - keep the primary focus fully visible
- shipped focus:
  - cross-surface duplicate prompt reduction
  - quieter low-value surfaced work when recent follow-through is weak or mixed
  - preserving repair-first and urgent-work-first precedence while making the workspace calmer

## Phase 32

Phase 32 is now complete.

Delivered shape:

- one shared `ReviewApprovalFlowSummary` read model for prepared review, approval, and send handoffs
- grouped outbound treated as the primary forward path when grouped context exists
- status, workspace focus, assistant guidance, Drafts, and Approvals aligned around one operator handoff story
- approval detail made more recovery-oriented and inspection-oriented when the approval belongs to a grouped handoff
- review packages and tuning proposals kept visible but secondary
- unchanged trust boundaries:
  - no new HTTP or MCP routes
  - no new persistence
  - no new commands
  - no lifecycle changes for review, approval, or grouped outbound state transitions
  - no worklist ordering changes

## Phase 33

Phase 33 is now complete.

Delivered shape:

- a small `review_approval_flow_outcomes` SQLite memory layer for the current primary handoff only
- one additive calibration summary attached to `ReviewApprovalFlowSummary` that says whether recent handoff evidence is:
  - `insufficient_evidence`
  - `working`
  - `mixed`
  - `attention_needed`
- one bounded recommendation over that same evidence:
  - keep the current handoff
  - consider more batching
  - consider review tuning
  - consider decision-surface adjustment
- additive calibration visibility across:
  - `status`
  - workspace focus
  - top assistant guidance
  - the console-backed desktop shell
- unchanged trust boundaries:
  - no new HTTP or MCP routes
  - no new user-facing commands
  - no approval, send, or review authority expansion
  - no lifecycle mutation changes for review, approval, or grouped outbound work
  - no worklist ordering changes

## Phase 34

Phase 34 is now complete.

Delivered shape:

- one explicit proof gate now decides when a review/approval supporting explanation may be promoted
- the status-style handoff narrative remains the canonical composition owner
- status and console now align on the same primary handoff, command precedence, and proof-triggered secondary explanation
- the console removes the generic review-focus note when the proof-gated supporting explanation is stronger
- grouped outbound remains structurally primary whenever it exists
- calibration remains explanatory and secondary
- deterministic seam coverage now directly protects the proof gate, console/status alignment, MCP review/approval seams, and browser console module loading

The proof gate requires:

- `calibration.eligible === true`
- `calibration.status === "attention_needed"`
- `calibration.recommendation_kind === "consider_decision_surface_adjustment"`
- `supporting_summary` is present
- `sample_count_14d >= 4`

Unchanged trust boundaries:

- no new HTTP or MCP product routes
- no new user-facing commands
- no new queue kinds or persistence
- no lifecycle mutation changes for review, approval, or grouped outbound work
- no approval, send, or review authority expansion
- no worklist ordering changes

## Phase 35

Phase 35 is the next target.

Contract shape:

- validate whether the new proof-gated supporting explanation is stable enough to remain the default presentation
- stay read-model and evidence-first instead of immediately making another wording or ranking pass
- only reopen review/approval surface work if repeated follow-through evidence still points at the same unresolved gap

## Preserve Across Compaction

- this file is the canonical roadmap for the assistant-led initiative
- Phases 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, and 34 are complete
- Cluster A is complete
- Cluster B is complete
- the post-Cluster-B stabilization pass is merged
- Assistant-Led Phase 35 is the next target
- every completed phase should have a plan doc and a rollout doc
- the intended product direction is:
  - less manual operator work
  - more prepared assistant actions
  - console first
  - optional desktop wrapper for daily use
  - trust boundaries still explicit for risky actions
