# Assistant-Led Workspace Roadmap

## Purpose

This roadmap starts after the completed post-launch track.

Its goal is to make `personal-ops` feel easier to use and more assistant-like:

- the console should become the main daily workspace
- the system should prepare more work before the operator asks
- the operator should spend more time reviewing and less time manually gathering context or chaining commands

This document is the durable source of truth for the assistant-led initiative and its final shipped state.

## Baseline

`personal-ops` already has:

- a stable local daemon, CLI, HTTP API, and MCP bridge
- a lightly interactive browser console
- workflow bundles for day-start, follow-up, meeting prep, and now-next guidance
- deterministic ranking and narrow external context from GitHub plus Drive and Docs
- recurring automations for health, briefings, recovery snapshots, and rehearsal reminders
- verified backup, restore, and release gates

The assistant-led track deepened that behavior on top of the baseline instead of rebuilding it.

## Current Shipped Baseline

The currently shipped assistant-led baseline is:

- Phases 1 through 38 complete
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
- the Phase 35 review surface stability check is merged
- the Phase 36 prepared handoff consistency review is merged
- the Phase 37 verification-boundary and docs simplification pass is merged
- the Phase 38 documentation architecture and history compaction pass is merged
- this assistant-led roadmap remains separate from the older legacy `PHASE-*` governance track

The assistant-led track is now complete.

The final terminal compaction outcome is:

- the roadmap stays current and compact
- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md` carries the durable assistant-led historical narrative
- `docs/PROGRAM-COMPLETE-SUMMARY.md` remains the earlier legacy historical summary
- older assistant-led phase plan and rollout docs remain available as searchable archive/reference

## Post-Completion Maintenance Note

After the assistant-led track was completed, the repo also received a follow-up audit and cleanup pass on 2026-04-15.

That pass:

- fixed an active CLI regression on the working branch
- made local builds clean `dist/` before compile
- moved older phase-by-phase historical artifacts into `docs/archive/`
- refreshed current-truth docs so resume-work context is easier to recover

For the latest repo checkpoint after that stabilization pass, use `docs/CURRENT-STATE.md`.

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
| 17 | Preventive Maintenance Recommendations | Turn repeated resolved repairs into quieter preventive guidance instead of repeated active repair noise | Complete |
| 18 | Calm-Window Maintenance Bundles | Surface preventive work only when the workspace is genuinely calm enough to absorb it | Complete |
| 19 | CLI Maintenance Session | Add one bounded CLI-only maintenance session over the calm-window model | Complete |
| 20 | Maintenance Follow-Through | Measure whether maintenance guidance actually turns into progress and resurface it appropriately | Complete |
| 21 | Maintenance Escalation | Promote repeated maintenance-to-repair failures into a bounded warn-level cue | Complete |
| 22 | Maintenance Scheduling | Decide where the top maintenance cue belongs without widening execution scope | Complete |
| 23 | Maintenance Commitments | Add small local commitment memory for scheduled maintenance without creating new planning state | Complete |
| 24 | Maintenance Confidence | Add descriptive confidence signals over maintenance follow-through and repair history | Complete |
| 25 | Maintenance Operating Block | Add a calmer operating-block explanation for when maintenance belongs now versus later | Complete |
| 26 | Maintenance Decision Explanation | Explain why maintenance is promoted, deferred, or suppressed without adding new authority | Complete |
| 27 | Workflow Personalization | Personalize workflow timing and emphasis without changing core ranking ownership | Complete |
| 28 | Maintenance-Repair Convergence | Make repair-owned versus maintenance-owned recurring work clearer across top surfaces | Complete |
| 29 | Workspace Home | Turn the overview into one calmer primary “what matters now” story | Complete |
| 30 | Surfaced Work Outcomes | Record whether top surfaced work was actually useful enough to be acted on | Complete |
| 31 | Cross-Surface Noise Reduction | Use surfaced-work outcomes to quiet repeated low-value secondary cues | Complete |
| 32 | Review/Approval Handoff Ergonomics | Align top surfaces around one shared prepared-handoff read model | Complete |
| 33 | Review Outcome Calibration | Add bounded calibration evidence to the prepared-handoff summary | Complete |
| 34 | Review Surface Adjustment Proof | Add a proof gate for promoting supporting review/approval explanation | Complete |
| 35 | Review Surface Stability Check | Confirm the Phase 34 surface remains justified and strengthen future closeout rules | Complete |
| 36 | Prepared Handoff Consistency Review | Audit and clean duplicate grouped-handoff narratives across top surfaces | Complete |
| 37 | Verification Boundary and Docs Simplification | Clarify verifier ownership and tighten current-truth documentation routing | Complete |
| 38 | Documentation Architecture and History Compaction | Finish the assistant-led track by compacting history into durable summaries | Complete |

## Completed Delivery Eras

The assistant-led track is complete.

Its completed work now falls into four durable eras:

1. **Console-first workspace and prepared execution**
   - Phases 1 through 8 turned the console into the main operator surface and added prepared inbox, meeting, planning, outbound, desktop, and warm-start flows.
2. **Review intelligence and operator calibration**
   - Phases 9 through 12 added bounded review packages, reporting, trends, and calibration without widening authority.
3. **Local reliability, repair, and maintenance maturity**
   - Phases 13 through 29 hardened desktop/install support, repair plans, repair outcome memory, maintenance guidance, and calmer workspace focus.
4. **Surface-proofing, prepared-handoff consistency, and governance cleanup**
   - Phases 30 through 38 reduced cross-surface noise, aligned prepared handoffs, tightened proof gates, clarified verification ownership, and compacted the documentation architecture.

For the durable historical narrative across those eras, use `docs/ASSISTANT-LED-HISTORY-SUMMARY.md`.

## Final Assistant-Led Status

The currently shipped assistant-led baseline is:

- Phases 1 through 38 complete
- Cluster A complete
- Cluster B complete
- the post-Cluster-B stabilization pass merged
- the assistant-led track complete

No later assistant-led phases remain in this roadmap.

## Preserve Across Completion

- this file is the canonical roadmap for the assistant-led initiative
- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md` is the durable historical summary for the assistant-led track
- `docs/PROGRAM-COMPLETE-SUMMARY.md` remains the historical snapshot and legacy context for the earlier pre-assistant-led program
- every completed assistant-led phase should have a plan doc and a rollout doc
- assistant-led audit docs are optional and should exist only when a phase genuinely needs a decision ledger
- every completed assistant-led phase must also end with:
  - a review of what it built
  - cleanup of what is no longer needed
  - a summary of what shipped
  - a detailed writeup of the next phase when another assistant-led phase still exists
  - short one-line notes for any remaining roadmap phases while the track is still active
- artifact roles are:
  - this roadmap = current and future truth
  - the current phase plan doc = implementation contract
  - the current phase rollout doc = shipped summary and cleanup record
  - `docs/ASSISTANT-LED-HISTORY-SUMMARY.md` = durable assistant-led historical context
  - `docs/PROGRAM-COMPLETE-SUMMARY.md` = legacy historical context
- the intended product direction preserved by the completed track is:
  - less manual operator work
  - more prepared assistant actions
  - console first
  - optional desktop wrapper for daily use
  - trust boundaries still explicit for risky actions
