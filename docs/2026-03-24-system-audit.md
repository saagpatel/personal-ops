# personal-ops System Audit

Date: 2026-03-25
Audited by: Codex
Scope: Phase 1 through Phase 33

## Executive Summary

`personal-ops` is now verified as a healthy machine-level shared control plane across:

- mail drafts and approval-gated send
- inbox awareness
- internal tasks and task suggestions
- Google Calendar awareness
- operator-controlled calendar mutation
- task-to-calendar scheduling
- assistant-guided planning recommendations
- ranked and grouped planning operations
- shared assistant access for Codex and Claude

This audit covers the live machine service, not just source code.

Phase 8 introduced durable planning recommendations. Phase 9 hardened that layer with ranking, grouped planning summaries, richer explanation, operator-only `replan`, and stronger startup safety for schema upgrades. Phase 10 turned that planning layer into a better operator execution surface with outcome tracking, slot-state tracking, collision-aware grouped planning, next-action reads, and low-risk grouped operator actions. Phase 11 completed the reporting layer with closure analytics, backlog summaries, throughput context, and stronger cross-phase verification. Phase 12 now separates active work from history, adds filtered analytics, and uses recent closure evidence to calibrate planning quality without widening mutation scope. Phase 13 added advisory hygiene reporting, queue-share visibility, and closure-meaning summaries. Phase 14 completed the operator review loop for those hygiene candidates with audit-derived review state and review-needed summaries without changing schema or ranking behavior. Phase 15 added explicit, operator-only, non-enforcing hygiene policy proposals plus reviewed-family follow-through reporting and tuning summaries on top of that Phase 14 review loop. Phase 16 refined that loop with operator-facing attention/history tuning and assistant-safe redaction for proposal-authored metadata. Phase 17 added explicit policy-governance history for inactive proposal families plus tighter assistant-safe planning-history shaping. Phase 18 tightened assistant-safe audit visibility, added explicit operator-controlled policy-history retention, and extended policy reporting across active backlog, recent exits, and long-horizon history. Phase 19 kept that storage model intact while adding derived grouped policy-history summaries, repeated-family and mixed-outcome visibility, and clearer operator governance hygiene reporting without widening assistant access. Phase 20 made assistant-safe audit policy explicit and categorized while simplifying compact policy attention around `recommendation policy`. Phase 21 removed the deprecated operator-only `policy_history` alias. Phase 22 removed the last deprecated compact policy status fields. Phase 23 treated the current governance surface as the supported baseline and consolidated policy-attention derivation so `recommendation policy`, `status`, and `worklist` stay aligned without changing the public contract. Phase 24 kept that contract stable while reducing duplication in human-readable `status` and clarifying that compact policy counts were context, not the primary operator cue. Phase 25 removed those last compact policy counts from `status`, leaving the compact governance signal centered only on `policy_attention_kind` and `top_policy_attention_summary`. Phase 26 keeps that simplified model unchanged and confirms it as the supported long-term baseline through stronger cross-surface consistency proof and clearer system documentation. Phase 27 keeps that supported baseline intact while simplifying human-readable policy reporting, preserving the same detailed sections and trust boundaries, and making the governance surface easier to scan and explain. Phase 28 keeps that supported baseline intact after live evidence review across `recommendation policy`, `status`, `worklist`, and assistant-safe audit, and it trims one small layer of repeated policy-report summary wording without changing any contract or trust boundary. Phase 29 keeps that supported baseline intact and removes the remaining empty cue noise from human-readable `recommendation policy`, so the detailed operator surface stays quieter without changing any machine-readable contract, trust boundary, or governance behavior. Phase 30 keeps that supported baseline intact and confirms through fresh live review that no additional governance-surface code change is currently justified. Phase 31 keeps that supported baseline intact while adding one narrow assistant-safe audit ergonomics improvement: an optional single-category filter on the existing audit read surfaces using the already-supported `sync`, `task`, `task_suggestion`, and `planning` categories. Phase 32 keeps that supported baseline intact while confirming through fresh live HTTP and MCP review that the current default-plus-single-category audit model is sufficient and does not justify a broader audit query surface. Phase 33 keeps that supported baseline intact while re-validating the same audit model at both quick and wider slices, confirming that it remains sufficient and that any remaining desire for broader audit queries is a convenience preference rather than a real defect.

Post-program audit follow-up tightens the live implementation to match that supported Phase 31-33 contract exactly: HTTP `GET /v1/audit/events` and MCP `audit_events_recent` now support only `limit` plus optional single `category`, and unsupported audit query params are rejected instead of remaining accidentally available.

The system is now verified as:

- tests passing at `84/84`
- repeated post-patch reruns passing `84/84` three additional consecutive times
- deep doctor passing at `38 pass / 0 warn / 0 fail`
- live daemon reachable and healthy after restart
- schema current at version `14`
- schema/runtime compatibility explicitly reported as healthy
- grouped planning summaries live in `status`, `worklist`, CLI, HTTP, and MCP-backed reads
- grouped recommendation detail, next-action reads, and throughput context live on the shared machine
- recommendation summary, backlog, and closure analytics live across CLI, HTTP, and MCP-backed reads
- recommendation first-action, closure, close-reason, and closer-attribution fields active on the shared machine
- active-versus-history counts now appear in live status output
- filtered backlog and closure analytics are live across CLI, HTTP, and MCP-backed reads
- advisory hygiene reporting is live across CLI, HTTP, and MCP-backed reads
- operator-reviewed hygiene triage is live across CLI and HTTP with assistant-safe read visibility
- explicit hygiene policy proposals are live across operator CLI and HTTP mutation
- reviewed/proposal follow-through summaries are live in status, summary, tuning, and hygiene reads
- tuning now exposes active `attention_families` plus compact recent closed-family history
- explicit policy governance reads and archive/supersede mutation are live across operator CLI and HTTP
- assistant-safe audit shaping is live across HTTP and MCP-backed audit reads
- operator-only policy-history prune is live across CLI and HTTP
- `recommendation policy` now connects active backlog, recent exits, grouped policy-history families, raw governance events, and retention candidates
- grouped policy-history family summaries are now live as operator-only derived reads
- repeated policy-family and mixed-outcome policy-family counts are now live
- `status` and `worklist` now surface compact policy-governance pressure
- the current governance surface is now explicitly treated as the supported baseline
- `recommendation policy`, `status`, and `worklist` now use one consolidated internal policy-attention decision path
- human-readable `status` now centers on one primary policy-attention line and no longer carries compact policy count fields
- human-readable `recommendation policy` now keeps the same supported detail with less repetitive framing
- Phase 28 evidence review now confirms the supported governance surfaces remain stable under live usage
- human-readable `recommendation policy` now suppresses empty cue rows so operators only see meaningful cue lines in the top cue cluster
- live Phase 29 steady state now shows only the meaningful `Recent exit cue` row instead of a block of `none` cue rows
- assistant-safe audit now keeps the same default safe categorized feed while adding an optional single-category filter on existing audit reads
- live Phase 31 filtered audit reads now isolate planning and task context without widening assistant visibility
- live Phase 32 review now confirms that both HTTP and MCP read paths behave consistently under that same default-plus-single-category audit model
- live Phase 33 review now confirms that the same audit model still holds up at both quick and wider slices and does not justify a broader query surface
- assistant-safe hygiene reads now redact proposal note, proposal attribution, review note, and review attribution
- assistant-safe recommendation detail now strips planning hygiene/proposal/policy audit history
- one live low-risk verification pass completed successfully on the shared machine and verified operator-only policy reads, assistant-safe planning-detail shaping, assistant-safe audit shaping, policy-governance retention reporting, and the new grouped policy-history report shape
- send still safely disabled by policy
- assistant/operator trust boundaries still enforced

No remaining blocking issues were found after the Phase 33 rollout pass.

## What This System Is

`personal-ops` is not a repo-local helper. It is a neutral machine-level service that keeps shared operational state in one place for multiple assistants and one operator.

Core properties:

- local daemon on `127.0.0.1:46210`
- local SQLite state and audit trail
- local config in `~/.config/personal-ops`
- local state in `~/Library/Application Support/personal-ops`
- local logs in `~/Library/Logs/personal-ops`
- operator CLI
- MCP access for Codex and Claude

Design intent:

- assistants are clients of `personal-ops`
- assistants do not own provider logic
- mail, inbox, tasks, calendar, planning, worklist, and diagnostics share one source of truth
- dangerous actions remain operator-controlled

## Audit Method

This audit used five lenses:

1. Documentation and contract review
   - `README.md`
   - `CLIENTS.md`
   - `PHASE-8-HANDOFF.md`
   - `PHASE-9-PLAN.md`
   - `PHASE-9-ROLLOUT.md`
   - `PHASE-10-PLAN.md`
   - `PHASE-10-ROLLOUT.md`
   - `PHASE-11-PLAN.md`
   - `PHASE-11-ROLLOUT.md`
   - `PHASE-12-PLAN.md`
   - `PHASE-12-ROLLOUT.md`
   - `PHASE-13-PLAN.md`
   - `PHASE-13-ROLLOUT.md`
   - `PHASE-14-PLAN.md`
   - `PHASE-14-ROLLOUT.md`
   - `PHASE-15-PLAN.md`
   - `PHASE-15-ROLLOUT.md`
   - `PHASE-16-PLAN.md`
   - `PHASE-16-ROLLOUT.md`
   - `PHASE-17-PLAN.md`
   - `PHASE-17-ROLLOUT.md`
   - `PHASE-18-PLAN.md`
   - `PHASE-18-ROLLOUT.md`
   - `PHASE-19-PLAN.md`
   - `PHASE-19-ROLLOUT.md`
   - `PHASE-20-PLAN.md`
   - `PHASE-20-ROLLOUT.md`
   - `PHASE-21-PLAN.md`
   - `PHASE-21-ROLLOUT.md`
   - `PHASE-22-PLAN.md`
   - `PHASE-22-ROLLOUT.md`
   - `PHASE-23-PLAN.md`
   - `PHASE-23-ROLLOUT.md`
   - `PHASE-24-PLAN.md`
   - `PHASE-24-ROLLOUT.md`
   - `PHASE-25-PLAN.md`
   - `PHASE-25-ROLLOUT.md`
   - `PHASE-26-PLAN.md`
   - `PHASE-26-ROLLOUT.md`
2. Source verification
   - `db.ts`
   - `service.ts`
   - `http.ts`
   - `cli.ts`
   - `mcp-server.ts`
   - `types.ts`
   - `formatters.ts`
   - `daemon.ts`
3. Automated verification
   - `npm test`
4. Live runtime verification
   - `personal-ops doctor --deep --json`
   - `personal-ops status --json`
   - `personal-ops worklist --json`
   - `personal-ops recommendation list --grouped --json`
   - `personal-ops recommendation group show ... --json`
   - `personal-ops recommendation next --json`
   - `personal-ops recommendation summary --json`
   - `personal-ops recommendation backlog --json`
   - `personal-ops recommendation closure --json`
   - `personal-ops recommendation hygiene --json`
   - `personal-ops recommendation hygiene --review-needed-only --json`
   - `personal-ops recommendation tuning --json`
   - `personal-ops recommendation policy --json`
   - `personal-ops recommendation policy`
5. Rollout safety verification
   - daemon restart
   - migration behavior on the real existing database
   - schema compatibility preflight
   - low-risk operator action verification
   - operator-only hygiene review mutation verification
   - operator-only hygiene proposal mutation verification

## Current Verified State

### Automated checks

- `npm run typecheck` passed
- `npm test` passed `84/84`
- `npm test` repeated three additional consecutive times at `84/84`
- after the final Phase 33 documentation touch, `npm test` passed four more consecutive times at `84/84`

Phase 33 coverage now includes:

- schema migration to `v13`
- schema compatibility coverage for Phase 11 planning columns
- deterministic ranking and grouped planning behavior
- recommendation outcome propagation after linked task completion and cancellation
- first-action tracking for replan, snooze, reject, and grouped actions
- closure tracking for grouped reject, source resolution, task completion, and task cancellation
- grouped slot-collision handling with manual-scheduling fallback
- grouped detail, next-action, and throughput-context reads
- summary, backlog, and closure analytics reads
- active-versus-history status counts
- filtered backlog and closure analytics
- group-level closure-mix context
- conservative calibration and ranking-version refresh
- grouped HTTP recommendation reads plus transport coverage for new analytics reads
- operator-only enforcement for grouped and single-item planning mutations
- audit-derived hygiene review state and re-open behavior when new signal evidence lands
- operator-only hygiene review transport coverage with assistant-safe `review_needed_only` reads
- durable proposal record and dismiss coverage keyed by hygiene family
- follow-through derivation for reviewed and proposal states
- tuning report coverage across service and transport paths
- assistant-safe proposal metadata redaction coverage
- operator-only recent closed-family tuning history coverage
- dismissed-family reopening coverage when new evidence lands
- worklist follow-through filtering for stale-only pressure
- compact policy count retirement from the shared status contract
- unchanged detailed policy reporting after status cleanup
- one-line human-readable status attention after compact count removal
- unchanged assistant-safe audit scope after the compact status cleanup
- strengthened summary alignment coverage across `recommendation policy`, `status`, and `worklist`
- proof that `status` keeps only the compact primary policy-attention fields
- explicit confirmation that assistant-safe audit remains the supported fixed categorized feed
- human-readable policy formatter ordering and reduced repetitive framing
- live-evidence coverage for the still-supported `recommendation policy`, `status`, `worklist`, and assistant-safe audit split
- repeated full-suite reruns after time-of-day test stabilization
- status regression coverage so closed manual-scheduling rows no longer inflate active planning counts
- assistant-safe audit omission and sanitization coverage
- policy recent-exit and retention-candidate coverage
- policy prune dry-run and delete coverage
- proof that governance prune deletes policy-history rows only
- grouped policy-history family derivation from repeated governance events
- mixed archive/supersede outcome detection
- grouped-family recommended-action derivation for `monitor`, `prune_old_history`, and `review_policy_churn`
- wider `limit=20` live audit evidence across both HTTP and MCP read paths
- confirmation that sync-heavy default slices still pair cleanly with focused planning, task, and task-suggestion reads
- explicit sufficiency validation that no broader audit query surface is currently justified
- proof that the remaining convenience gap is not a runtime defect or trust-boundary mismatch
- note-free grouped policy-history summaries with unchanged raw-governance drill-down
- cross-surface policy-attention consistency for `recent_exit`, `history_churn`, `retention_candidate`, and `none`
- proof that the compact status surface now centers only on `policy_attention_kind` and `top_policy_attention_summary`
- proof that assistant-safe audit shaping remains unchanged while operator audit stays raw
- proof that human-readable `status` keeps one primary `Policy attention` line without reintroducing a competing policy mini-dashboard
- proof that non-empty policy cue rows still render while empty cue rows are omitted
- proof that the entire top cue block disappears when every cue value is empty
- proof from fresh live review that no additional governance-surface code change is currently justified
- additive audit category-filter coverage for assistant-safe `sync`, `task`, `task_suggestion`, and `planning` slices
- proof that filtered assistant-safe audit reads never widen the current visible event set
- proof that filtered operator audit reads remain raw
- validation coverage for unknown audit category values
- live evidence that MCP `audit_events_recent(category=...)` matches the HTTP category-filter behavior
- live evidence that the `task_suggestion` filtered slice remains coherent even when it is smaller than the task or planning slices

### Live health checks

- `personal-ops doctor --deep --json`
  - state: `ready`
  - summary: `38 pass / 0 warn / 0 fail`
  - schema version: `14`
  - schema compatibility: `true`
- `personal-ops status --json`
  - state: `ready`
  - daemon reachable: `true`
  - launch agent loaded: `true`
  - schema current: `14`
  - active-versus-history counts are present for tasks, task suggestions, and planning recommendations
  - top planning group: `6 urgent inbox follow-ups could be time-blocked`
  - top next planning action is present
  - top backlog and closure summaries are present
  - `review_needed_count` and `top_review_needed_summary` are present
  - reviewed/proposal follow-through counts are present
  - compact `policy_attention_kind` and `top_policy_attention_summary` are present
- `personal-ops worklist --json`
  - grouped planning summaries are live
  - `planning_recommendation_group` items are present
  - raw same-group planning rows are capped in the top-level worklist
  - policy-governance worklist pressure is present when recent exits exist
  - policy worklist pressure remains one-at-a-time
- `personal-ops recommendation list --grouped --json`
  - grouped planning recommendation reads are live
  - rank, outcome, and slot-state fields are present
- `personal-ops recommendation group show urgent_inbox_followups --json`
  - grouped detail is live
  - counts by status, outcome, and slot state are present
  - throughput fields are present
- `personal-ops recommendation next --json`
  - next-action read is live
  - payload includes outcome and slot-state context
- `personal-ops recommendation summary --json`
  - summary analytics are live
  - backlog and closure summary fields are present
- `personal-ops recommendation backlog --json`
  - backlog analytics are live
  - stale, manual, resurfaced, and closure-mix group counts are present
- `personal-ops recommendation backlog --group urgent_inbox_followups --source system_generated --json`
  - filtered backlog analytics are live
  - filter echo is present in the payload
- `personal-ops recommendation closure --json`
  - closure analytics are live
  - totals and breakdowns by group, kind, close reason, and source are present
- `personal-ops recommendation closure --days 30 --close-reason rejected_handled_elsewhere --json`
  - filtered closure analytics are live
  - filter echo is present in the payload
- `personal-ops recommendation hygiene --json`
  - hygiene family reads are live
  - review metadata and closure-meaning summaries are present
- `personal-ops recommendation hygiene --review-needed-only --json`
  - review-needed filtering is live
  - assistant-safe reads remain non-mutating
- `personal-ops recommendation tuning --json`
  - tuning summary is live
  - reviewed and proposal follow-through counts are present
  - `attention_families` and `recently_closed_families` are present on operator reads
- `personal-ops recommendation policy --json`
  - recent policy exits and retention candidates are live
  - grouped policy-history family fields are live
  - `policy_history_recent_events` is live as the clearer raw-governance drill-down field
  - the report now spans active backlog, recent exits, grouped policy-history families, raw governance events, and retention candidates
- `personal-ops recommendation policy`
  - operator-readable grouped-history sections are live
  - the report now emphasizes grouped policy-history families before raw governance events
  - empty cue rows are now omitted so only meaningful cue lines remain visible in steady state
- assistant-safe `GET /v1/audit/events?limit=5`
  - sensitive/operator-only audit events are omitted
  - visible safe events now return sanitized `metadata_json`, `summary`, and `metadata_redacted = true`
- `personal-ops recommendation hygiene review --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --decision investigate_externalized_workflow --json`
  - operator-only hygiene review mutation is live
  - nested review flags and `--json` output were verified live from the CLI
- `personal-ops recommendation hygiene proposal record --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --json`
  - operator-only proposal record mutation is live
- `personal-ops recommendation hygiene proposal dismiss --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --json`
  - operator-only proposal dismiss mutation is live

### Current live operating facts

As of this audit:

- mailbox: `jayday1104@gmail.com`
- send policy effective state: `false`
- active send window: `none`
- inbox sync state: `ready`
- calendar sync state: `ready`
- owned writable calendars: `1`
- personal-ops active events: `0`
- linked scheduled tasks: `0`
- planning recommendations pending: `6`
- planning recommendations historical: `9`
- planning recommendations total: `15`
- planning recommendations rejected: `4`
- planning recommendations source resolved: `5`
- top planning group summary: `6 urgent inbox follow-ups could be time-blocked`
- top planning next action summary: `Set aside time to reply to ✅ Jay, finish setting up your iPhone with Google.`
- top planning backlog summary: `6 urgent inbox follow-ups could be time-blocked (6 open, 0 manual, 0 stale)`
- top planning closure summary: `9 closed in 30d (0 completed, 4 handled elsewhere)`
- planning review-needed count: `0`
- planning proposal-open count: `0`
- planning proposal-dismissed count: `0`
- planning policy recent-exit count: `1`
- planning policy retention-candidate count: `0`
- planning policy attention kind: `recent_exit`

### Live operator evidence

During the Phase 9 rollout check, a real pending follow-up recommendation was replanned successfully:

- recommendation id: `99e9449f-5827-4403-ba43-ab400e81ef75`
- old slot start: `2026-03-24T16:42:32.403Z`
- new slot start: `2026-03-24T17:12:32.403Z`
- `slot_reason`: `replanned_after_conflict`
- `replan_count`: `1`

During the Phase 10 rollout check, a real low-risk grouped operator action also succeeded:

- temporary verification task: `Phase 10 rollout temp block`
- derived planning group: `urgent_unscheduled_tasks`
- grouped action: `recommendation group snooze --preset tomorrow-morning`
- cleanup result: recommendation transitioned to `status = superseded`
- outcome result: recommendation transitioned to `outcome_state = source_resolved`

During the Phase 15 rollout check, a temporary task-backed hygiene family was reviewed and then moved through the new explicit proposal loop:

- temporary verification task: `Phase 15 rollout temp task`
- live candidate family:
  - `group = urgent_unscheduled_tasks`
  - `kind = schedule_task_block`
  - `source = system_generated`
  - `recommended_action = review_externalized_workflow`
- verified live states:
  - `follow_through_state = reviewed_fresh`
  - `follow_through_state = proposal_open`
  - `follow_through_state = proposal_dismissed`
- verified live summaries:
  - tuning `proposal_open_count = 1`
  - tuning `proposal_dismissed_count = 1`
  - status `proposal_open_count = 1`
  - status `proposal_dismissed_count = 1`
- verified invariant:
  - tracked recommendation kept `ranking_version = phase12-v1`
  - tracked recommendation kept `rank_score = 360`
  - tracked recommendation `updated_at` did not change during proposal mutation
- cleanup result:
  - temporary task transitioned to `state = canceled`
  - temporary recommendation transitioned to `outcome_state = source_resolved`

During the Phase 16 rollout check, a temporary task-backed hygiene family also verified the new tuning refinement loop:

- temporary verification task: `Phase 16 rollout temp task`
- live candidate family:
  - `group = urgent_unscheduled_tasks`
  - `kind = schedule_task_block`
  - `source = system_generated`
  - `recommended_action = review_externalized_workflow`
- verified live states:
  - `follow_through_state = review_needed`
  - `follow_through_state = proposal_open`
  - `follow_through_state = proposal_dismissed`
- verified live safe-read behavior:
  - assistant-safe hygiene returned `proposal_note = null`
  - assistant-safe hygiene returned `proposal_by_client = null`
  - assistant-safe hygiene returned `proposal_by_actor = null`
  - assistant-safe tuning kept `attention_families`
  - assistant-safe tuning returned `recently_closed_families = []`
- verified invariant:
  - tracked recommendation kept `ranking_version = phase12-v1`
  - tracked recommendation kept `rank_score = 360`
  - tracked recommendation `updated_at` stayed `2026-03-25T00:36:21.130Z` through review/proposal mutation
- cleanup result:
  - temporary task transitioned to `state = canceled`
  - temporary recommendation transitioned to `outcome_state = source_resolved`
  - final tuning returned zero active proposal counts and zero recent-history rows

During the Phase 11 rollout check, a low-risk live operator rejection also succeeded and updated analytics:

- temporary verification task: `Phase 11 rollout temp reject`
- derived recommendation id: `c16368d5-df26-4a1a-9f7f-9c9a2e098ed1`
- operator action: `recommendation reject --reason handled_elsewhere`
- first action recorded live as `first_action_type = reject`
- closure result: recommendation recorded `close_reason_code = rejected_handled_elsewhere`
- outcome result: recommendation recorded `outcome_state = handled_elsewhere`
- closure analytics moved from:
  - `closed_count = 2`
  - `handled_elsewhere_count = 0`
- to:
  - `closed_count = 3`
  - `handled_elsewhere_count = 1`
- cleanup:
  - temporary task was canceled with note `Phase 11 rollout cleanup`

During the Phase 12 rollout check, a low-risk live operator task and recommendation also verified active-versus-history clarity:

- temporary verification task: `Phase 12 rollout temp task`
- derived recommendation id: `3b19717c-b021-479b-8d14-c4a7a54aaec7`
- operator action: `recommendation reject --reason handled_elsewhere`
- status changed from:
  - planning `active_count = 5`
  - planning `historical_count = 3`
- to:
  - planning `active_count = 4`
  - planning `historical_count = 4`
- filtered closure analytics for `rejected_handled_elsewhere` changed from:
  - `closed_count = 1`
  - `handled_elsewhere_count = 1`
- to:
  - `closed_count = 2`
  - `handled_elsewhere_count = 2`
- cleanup:
  - temporary task was canceled with note `Phase 12 rollout cleanup`

During the Phase 13 rollout check, advisory hygiene reporting was also verified live:

- temporary verification task: `Phase 13 rollout temp task`
- derived recommendation id: `3aa74f24-4ed6-47fd-90ca-f774ff9c2300`
- hygiene candidate appeared live with:
  - `recommended_action = review_externalized_workflow`
  - `queue_share_pct = 20`
- operator action: `recommendation reject --reason handled_elsewhere`
- closure analytics moved to:
  - `handled_elsewhere_count = 3`
- cleanup:
  - temporary task was canceled with note `Phase 13 rollout cleanup`

During the Phase 14 rollout check, operator-reviewed hygiene triage was verified twice: once for the operator-only route and once again after a CLI parser fix.

- temporary verification task: `Phase 14 rollout temp task`
- derived recommendation id: `ae84e123-ffed-48f9-91bd-3bfaf0d581d5`
- initial operator review verification confirmed:
  - `review_needed_count` rose to `1`
  - the family appeared in `recommendation hygiene --review-needed-only --json`
  - operator-only review recorded audit-derived review metadata
  - `review_needed_count` returned to `0`
- initial cleanup action:
  - operator rejected the temporary recommendation with `handled_elsewhere`
  - closure analytics moved to `handled_elsewhere_count = 4`
  - temporary task was canceled with note `Phase 14 rollout cleanup`
- follow-up CLI verification after the parser fix:
  - temporary verification task: `Phase 14 CLI rollout temp task`
  - derived recommendation id: `5b6449d6-0814-4d72-b9b6-50c7a86b82fb`
  - operator action: `recommendation hygiene review --group urgent_unscheduled_tasks --kind schedule_task_block --source system_generated --decision investigate_externalized_workflow --json`
  - CLI returned raw JSON correctly and recorded:
    - `last_review_decision = investigate_externalized_workflow`
    - `last_review_by_client = operator-cli`
  - cleanup result:
    - temporary task was canceled with note `Phase 14 CLI rollout cleanup`
    - recommendation settled to `status = superseded`
    - `close_reason_code = source_resolved`
    - `outcome_state = source_resolved`

## Phase-by-Phase Record

### Phase 1

Delivered:

- local daemon
- Gmail installed-app OAuth
- Gmail draft create/update
- SQLite storage
- review queue
- Notification Center alerts
- CLI and Codex MCP integration

System meaning:

- mail work started as draft-first, not send-first

### Phase 1.5

Delivered:

- `status`
- `doctor`
- review detail and queue views
- better audit visibility
- local snapshots for recovery

System meaning:

- the control plane became observable and recoverable

### Phase 2

Delivered:

- approval-gated sending
- explicit approval queue states
- Gmail `users.drafts.send`
- operator-issued confirmation tokens for MCP approve/send
- dark-launch `allow_send`

System meaning:

- the system could send mail safely, but only through approvals and operator gating

### Phase 2.5

Delivered:

- timed send windows
- unified worklist
- recovery flows for failed approvals and stale review items
- daemon reminders for expiring approvals and degraded state

System meaning:

- the system became workable day to day instead of just technically capable

### Phase 2.6

Delivered:

- operator-only `review open`
- non-mutating health/status/worklist reads
- daemon-owned normalization

System meaning:

- read paths became trustworthy and side-effect free

### Phase 3

Delivered:

- metadata-only Gmail inbox sync
- mail sync state and message/thread index
- derived thread states
- inbox-aware worklist and status

System meaning:

- the control plane moved from "mail out" to "mail awareness"

### Phase 4

Delivered:

- assistant identity at the MCP boundary
- Codex and Claude parity against the shared client contract
- shared audit attribution by client identity

System meaning:

- both assistants now operate as first-class clients of one shared system

### Phase 5

Delivered:

- internal tasks
- assistant-safe task suggestions
- task-aware worklist and reminders
- operator task lifecycle flows
- active-list defaults and prune flows

System meaning:

- the control plane expanded beyond mail into general commitments and reminders

### Phase 6

Delivered:

- metadata-only Google Calendar awareness
- local source and event index
- bounded rolling-window calendar sync
- calendar-aware worklist and status
- CLI/HTTP/MCP calendar read surfaces

System meaning:

- the system gained time awareness without write risk

### Phase 7

Delivered:

- operator-only Google Calendar event create/update/cancel on owned calendars
- task-to-calendar scheduling
- event mutation tracking and provenance
- scheduling-aware worklist items
- calendar write readiness in status/doctor

System meaning:

- the operator can now reserve time through the same shared control plane

### Phase 8

Delivered:

- durable `planning_recommendations` storage
- recommendation kinds for task blocks, thread follow-up blocks, and event prep blocks
- recommendation statuses for `pending`, `applied`, `rejected`, `snoozed`, `expired`, and `superseded`
- schema upgrade to `v9`
- task provenance links back to recommendations, inbox threads, and source calendar events
- service-owned recommendation refresh driven by task, inbox, calendar, and scheduling changes
- operator `apply`, `reject`, `snooze`, and `refresh` flows
- assistant-safe recommendation reads
- assistant-created task-block scheduling recommendations
- worklist and status integration for active recommendation items
- duplicate low-level planning signal suppression when active recommendations exist

System meaning:

- the control plane gained a durable planning layer instead of only ephemeral scheduling pressure signals

### Phase 9

Delivered:

- schema upgrade to `v10`
- deterministic recommendation ranking with persisted score and reason
- grouped planning summaries in `status`, `worklist`, CLI, HTTP, and read APIs
- richer recommendation explanation and provenance
- operator-only `replan`
- snooze presets and reject reason codes
- startup schema preflight and stronger compatibility diagnostics
- live grouped planning reads without read-path mutation

System meaning:

- the planning layer became more operationally useful, more explainable, and safer to ship on the shared machine

### Phase 10

Delivered:

- schema upgrade to `v11`
- recommendation outcome tracking for `scheduled`, `completed`, `canceled`, `dismissed`, `handled_elsewhere`, and `source_resolved`
- slot-state tracking so recommendations can surface manual-scheduling needs
- collision-aware grouped planning generation
- mailbox freshness normalization for planning ranking
- grouped recommendation detail and next-action reads
- grouped operator `snooze` and grouped operator `reject` for low-risk decisions
- worklist shaping that keeps planning groups visible while capping duplicate raw child items

System meaning:

- the planning layer now supports a fuller operator loop from suggestion to outcome instead of stopping at recommendation ranking and single-item action

### Phase 11

Delivered:

- schema upgrade to `v12`
- recommendation lifecycle fields for first action, closure timing, close reason, and closer attribution
- derived planning summary, backlog, and closure analytics
- status shaping for stale counts, closure counts, median timing, and top summaries
- grouped detail throughput context for stale, resurfaced, and recently closed work
- assistant-safe CLI, HTTP, and MCP reads for analytics reports
- live migration and rollout verification on the existing shared machine database

System meaning:

- the planning layer now exposes not just what is queued, but how quickly the queue is moving and why items are closing

### Phase 12

Delivered:

- active-versus-history status counts for tasks, task suggestions, and planning recommendations
- filtered planning backlog and closure analytics across CLI, HTTP, and MCP-backed reads
- group-level closure-mix context in backlog groups and grouped recommendation detail
- `top_hygiene_summary` in planning status
- conservative ranking calibration from recent closure outcomes for `system_generated` recommendations only
- ranking metadata refresh to `phase12-v1`

System meaning:

- the planning layer now distinguishes what is actionable now from what is historical, and it uses recent closure evidence to explain queue quality without mutating the queue

### Phase 13

Delivered:

- derived `recommendation hygiene` reporting across CLI, HTTP, and MCP-backed reads
- queue-share and dominance visibility for active planning families
- suppression-candidate summaries in status and summary reads
- closure-meaning summaries across hygiene, backlog, grouped detail, and closure reports
- advisory-only hygiene classification with no new suppression state

System meaning:

- the planning layer now exposes which recommendation families look noisy or externally handled without changing the queue automatically

### Phase 14

Delivered:

- audit-derived hygiene review state keyed by `group_key`, `kind`, and `source`
- operator-only hygiene review mutation across CLI and HTTP
- assistant-safe `review_needed_only` hygiene filtering
- review-needed counts and summaries in status and summary, plus item-based worklist shaping
- compatibility shaping so hygiene summaries can point at the highest-priority review-needed family
- CLI hardening for nested hygiene-review flags and `--json`

System meaning:

- the planning layer now supports an explicit operator review loop for backlog-hygiene candidates without creating suppression state or widening assistant mutation scope

### Phase 15

Delivered:

- explicit schema-backed hygiene policy proposals keyed by `group_key`, `kind`, and `source`
- operator-only proposal record and dismiss mutation across CLI and HTTP
- follow-through states for reviewed hygiene families
- tuning summaries across CLI, HTTP, and assistant-safe MCP reads
- reviewed/proposal follow-through shaping in `status`, `recommendation summary`, and hygiene reads
- item-based worklist follow-through pressure without turning worklist into a counter-heavy tuning dashboard

System meaning:

- the planning layer now supports explicit, reviewable, still-non-automatic policy proposals and follow-through visibility without changing recommendation lifecycle state or widening assistant mutation scope

### Phase 16

Delivered:

- active `attention_families` in `recommendation tuning`
- compact operator-only `recently_closed_families` in `recommendation tuning`
- assistant-safe proposal metadata redaction in hygiene reads
- stale-only follow-through worklist pressure for `review_needed`, `reviewed_stale`, and `proposal_stale`
- clearer human-readable stale-versus-tracked tuning output without changing JSON status fields

System meaning:

- the planning layer now gives operators a better triage surface for active and recently closed hygiene families while keeping proposal posture explicit and assistant-safe reads narrower than the operator view

## Phase 10 Audit Delta

This audit specifically verified that Phase 10 improves operator throughput without bypassing the architecture introduced earlier.

Confirmed architectural outcomes:

- assistants still do not write calendar events directly
- operators still control calendar mutation
- `replan` updates existing recommendation rows instead of inventing a parallel scheduling system
- grouped planning views are derived read models, not separate queue records
- grouped operator actions are intentionally limited to low-risk `snooze` and `reject`
- recommendation outcomes live on existing recommendation rows instead of creating a second history system
- status and worklist remain read surfaces, not hidden mutation triggers
- Codex and Claude remain clients of the same machine-level control plane

Confirmed live outcomes:

- grouped planning summaries appear in live `status` and `worklist`
- grouped recommendation reads are live
- grouped recommendation detail and next-action reads are live
- recommendation outcomes update from linked task lifecycle events
- grouped operator snooze succeeded on the shared machine
- schema compatibility is surfaced in both `status` and `doctor`
- a real operator `replan` succeeded on the shared machine

## Phase 11 Audit Delta

This audit specifically verified that Phase 11 improves operator visibility and throughput reporting without widening mutation scope.

Confirmed architectural outcomes:

- analytics are derived from existing recommendation rows, not a parallel history system
- first-action and closure bookkeeping stay on the same durable recommendation record
- summary, backlog, and closure reads are non-mutating
- grouped detail remains a derived read model instead of a second queue
- assistants gained read visibility, not new mutation rights
- send remains operator-gated
- calendar mutation remains operator-only

Confirmed live outcomes:

- schema `12` migrated cleanly on the existing machine database
- summary, backlog, and closure analytics are live on the shared machine
- status exposes stale, closure, and median timing context live
- grouped detail exposes throughput context live
- a real grouped operator snooze recorded first action live
- cleanup of that temporary task closed the recommendation with `source_resolved`
- closure analytics changed on live data after that action and cleanup

## Phase 12 Audit Delta

This audit specifically verified that Phase 12 improves queue clarity and planning calibration without changing the existing trust model.

Confirmed architectural outcomes:

- schema stays at `12`
- analytics remain derived and non-mutating
- active-versus-history clarity lives in read models and status shaping, not a new queue
- filtered backlog and closure analytics stay read-only
- calibration uses recent closure evidence but only changes ranking and explanation
- calibration applies only to `system_generated` recommendations
- assistants still gained read visibility, not new mutation rights
- send remains operator-gated
- calendar mutation remains operator-only

Confirmed live outcomes:

- `status` now reports active and historical totals side by side
- filtered backlog analytics are live on the shared machine
- filtered closure analytics are live on the shared machine
- grouped detail exposes closure-mix context live
- ranking metadata refreshed to `phase12-v1`
- a real low-risk operator reject changed active-versus-history counts exactly as intended
- closure analytics changed on live data after that action and cleanup

## Phase 13 Audit Delta

This audit specifically verified that Phase 13 improves backlog-hygiene visibility without introducing suppression state or queue-side mutation.

Confirmed architectural outcomes:

- hygiene reporting is derived from existing recommendation rows
- queue-share visibility is read-only and active-queue scoped
- suppression candidates remain advisory only
- closure-meaning summaries stay aligned with the same closure evidence used for advisory classification
- assistants gained read visibility, not new mutation rights

Confirmed live outcomes:

- hygiene reporting is live on the shared machine
- candidate-only filtering is live
- advisory candidates appear only while qualifying open families exist
- closure analytics and hygiene summaries updated correctly after a low-risk live cleanup loop

## Phase 14 Audit Delta

This audit specifically verified that Phase 14 adds operator-reviewed hygiene triage without introducing suppression state or widening trust boundaries.

Confirmed architectural outcomes:

- hygiene review state is derived from audit events, not a new table
- `review_needed_only` is a read filter on the existing hygiene report
- operator-only review mutation records audit intent but does not mutate recommendation lifecycle state
- schema stays at `12`
- ranking stays at `phase12-v1`
- assistants gained no new mutation rights

Confirmed live outcomes:

- `review_needed_count` and `top_review_needed_summary` are live in status
- `planning_hygiene_review_needed` worklist shaping is live when needed
- operator-only review mutation works on the shared machine
- the documented CLI review command was re-verified live after the nested-flag / `--json` parser fix
- final cleanup restored the task queue to zero active items

## Phase 15 Audit Delta

This audit specifically verified that Phase 15 adds explicit, operator-only proposal records and reviewed-family follow-through without turning proposals into hidden execution.

Confirmed architectural outcomes:

- proposal state lives in an additive schema `13` table keyed by hygiene family
- proposal mutation remains operator-only across CLI and HTTP
- assistants gained new read visibility through tuning and enriched hygiene reads, not new mutation rights
- proposal state does not change recommendation ranking, visibility, refresh behavior, or lifecycle state
- worklist remains item-based rather than becoming a second proposal dashboard
- suppression posture remains explicit, reviewable, and non-automatic

Confirmed live outcomes:

- schema `13` migrated cleanly on the existing machine database
- `recommendation tuning` is live on the shared machine
- a real reviewed family moved through `reviewed_fresh`, `proposal_open`, and `proposal_dismissed`
- live status and tuning summaries reflected `proposal_open_count = 1` and `proposal_dismissed_count = 1` during the rollout loop
- the tracked recommendation kept `ranking_version = phase12-v1`, `rank_score = 360`, and the same `updated_at` while proposal mutation happened
- final cleanup returned active proposal counts to `0`

## Phase 16 Audit Delta

This audit specifically verified that Phase 16 improves operator tuning ergonomics and proposal-metadata trust boundaries without changing schema, ranking, or mutation scope.

Confirmed architectural outcomes:

- schema stays at `13`
- ranking stays at `phase12-v1`
- `attention_families` is active-only and ordered for operator follow-through
- `recently_closed_families` is operator-focused history, not a new queue or mutation surface
- assistant-safe hygiene reads redact proposal note and proposal attribution by value while keeping stable payload keys
- assistant-safe tuning retains active attention but omits operator-only recent-history rows
- worklist stays item-based and no longer treats non-stale proposal-open families as follow-through pressure

Confirmed live outcomes:

- daemon restart picked up the new Phase 16 tuning shape on the shared machine
- a real task-backed family appeared in `attention_families` as `review_needed`, then `proposal_open`
- assistant-safe HTTP hygiene reads returned redacted proposal note and attribution live
- assistant-safe HTTP tuning reads kept `recently_closed_families = []`
- the tracked recommendation kept `ranking_version = phase12-v1`, `rank_score = 360`, and unchanged `updated_at` during review/proposal mutation
- final cleanup restored active proposal counts to `0` and cleared tuning attention/history rows

## Phase 17 Audit Delta

This audit specifically verified that Phase 17 adds explicit long-horizon policy governance and tighter planning-specific assistant-safe history shaping without turning policy state into hidden execution.

Confirmed architectural outcomes:

- schema moves to `14`
- ranking stays at `phase12-v1`
- explicit append-only policy governance events now distinguish inactive `archived` and `superseded` ideas from active `dismissed_for_now` posture
- `recommendation policy` is operator-only and separate from active `recommendation tuning`
- assistant-safe hygiene now redacts operator review note and review attribution
- assistant-safe recommendation detail now strips hygiene/proposal/policy governance audit history from `related_audit_events`
- policy governance remains explicit, operator-authored, and non-enforcing

Confirmed live outcomes:

- schema `14` migrated cleanly on the existing machine database
- operator CLI and HTTP policy reads are live on the shared machine
- assistant HTTP policy reads fail cleanly with `Only the operator channel may read planning policy governance.`
- assistant-safe live recommendation detail returned normal recommendation data with planning-policy audit history stripped from `related_audit_events`
- final steady state ended with zero active policy backlog rows and zero policy history rows

## Phase 19 Audit Delta

This audit specifically verified that Phase 19 keeps policy-history compression derived-only while making long-horizon governance history easier for the operator to scan and reason about.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- raw governance events remain the source of truth
- no durable compressed-history state was added
- `recommendation policy` now derives grouped policy-history families at read time only
- grouped policy-history families now surface repeated-cycle and mixed-outcome governance pressure
- `policy_history_recent_events` now carries the raw operator drill-down path while `policy_history` remains a temporary compatibility alias
- `status` and `worklist` stay compact and do not gain new policy-history counters or kinds
- assistant-safe audit shaping remains unchanged from Phase 18

Confirmed live outcomes:

- the restarted live daemon returned Phase 19 policy fields:
  - `recent_policy_exit_count`
  - `retention_candidate_count`
  - `policy_history_family_count`
  - `repeated_policy_family_count`
  - `mixed_outcome_policy_family_count`
  - `policy_history_families`
  - `policy_history_recent_events`
- the restarted live operator formatter now shows:
  - `Governance Hygiene Watchlist`
  - `Compressed Policy History By Family`
  - `Recent Raw Governance Events`
- the live machine ended the rollout in a healthy steady state with:
  - `policy_recent_exit_count = 1`
  - `policy_retention_candidate_count = 0`
  - `planning_policy_governance_needed` present in `worklist`
  - `policy_history_family_count = 0`
  - `repeated_policy_family_count = 0`
  - `mixed_outcome_policy_family_count = 0`
  - no existing live repeated-history family was present, so repeated/mixed behavior was confirmed in automated tests rather than by creating artificial live governance rows

## Phase 20 Audit Delta

This audit specifically verified that Phase 20 keeps the assistant-safe audit boundary stable while making that visibility policy explicit and simplifying policy attention on compact operator surfaces.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- assistant-safe audit exposure remains substantially unchanged from Phase 18 and Phase 19
- assistant-safe audit shaping is now driven by an explicit policy registry instead of an implicit large switch
- visible assistant-safe audit events now carry explicit categories:
  - `sync`
  - `task`
  - `task_suggestion`
  - `planning`
- operator audit reads remain raw
- `recommendation policy` is now the primary detailed operator governance surface through:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
- `status` now emphasizes one primary policy-attention line while keeping compatibility fields
- `worklist` now emits at most one policy item at a time
- `policy_history_recent_events` remains the preferred raw-governance field and `policy_history` remains a deprecated compatibility alias through Phase 20

Confirmed live outcomes:

- assistant-safe live `GET /v1/audit/events?limit=5` returned only already-safe sync events during rollout and each visible event carried:
  - sanitized `metadata_json`
  - short `summary`
  - `metadata_redacted = true`
  - `assistant_safe_category = "sync"`
- operator live `GET /v1/audit/events?limit=5` remained raw and still showed unsanitized sync metadata plus snapshot events
- live `recommendation policy --json` returned:
  - `policy_attention_kind = "recent_exit"`
  - `policy_attention_summary` populated
  - `policy_attention_command = "personal-ops recommendation policy"`
- live human-readable `recommendation policy` now begins with `Primary Policy Attention`
- live human-readable `status` now shows one `Policy attention` line instead of multiple equal-weight policy summary lines
- live `worklist` emitted only one policy item in steady state:
  - `planning_policy_governance_needed`
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 21 Audit Delta

This audit specifically verified that Phase 21 removes the one clearly deprecated operator-only policy alias without changing the live behavior of the shared planning and audit surfaces around it.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `policy_history` has been removed from the shared policy-report contract
- `policy_history_recent_events` remains the only raw-governance field
- assistant-safe audit remains the same fixed categorized feed from Phase 20
- deprecated compact status compatibility fields remain in place for one more phase
- compact worklist policy behavior remains one-at-a-time
- no new mutation surface was added

Confirmed live outcomes:

- live `recommendation policy --json` no longer returns `policy_history`
- live `recommendation policy --json` still returns `policy_history_recent_events`
- live `status --json` still returns:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
  - `top_policy_recent_exit_summary`
  - `top_policy_retention_candidate_summary`
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- live `worklist --json` still emitted only one policy item in steady state
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 22 Audit Delta

This audit specifically verified that Phase 22 retires the last deprecated compact policy status fields without changing the underlying governance or assistant-safe audit model.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed governance surface
- `top_policy_recent_exit_summary` has been removed from the shared status-report contract
- `top_policy_retention_candidate_summary` has been removed from the shared status-report contract
- `policy_attention_kind` and `top_policy_attention_summary` remain the primary compact policy fields
- assistant-safe audit remains the same fixed categorized feed from Phase 20 and Phase 21
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` no longer returns:
  - `top_policy_recent_exit_summary`
  - `top_policy_retention_candidate_summary`
- live `status --json` still returns:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- live `recommendation policy --json` remains unchanged in meaning and still returns `policy_history_recent_events`
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- live `worklist --json` still emitted only one policy item in steady state
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 23 Audit Delta

This audit specifically verified that Phase 23 consolidates policy-attention derivation internally and treats the current governance surface as the supported baseline without changing the public contract.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` keeps compact policy counts plus the primary compact policy-attention fields
- `worklist` keeps one-at-a-time policy pressure
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 22
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` still returns:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
  - `policy_history_recent_events`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 24 Audit Delta

This audit specifically verified that Phase 24 keeps the governance contract stable while reducing duplication in human-readable `status` and treating the remaining compact policy counts as lower-priority context.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` keeps:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- human-readable `status` now emphasizes one primary policy-attention line and de-emphasizes the compact counts
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 23
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` still returns:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - `Policy recent exits`
  - `Policy retention candidates`
  in a lower-priority position
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
  - `policy_history_recent_events`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 25 Audit Delta

This audit specifically verified that Phase 25 removes the remaining compact policy count fields from `status` while leaving the detailed governance surface and assistant-safe audit model unchanged.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` no longer returns:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
- `status` still returns:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- `worklist` still emits one policy item at a time
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 24
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` no longer returns:
  - `policy_recent_exit_count`
  - `policy_retention_candidate_count`
- live `status --json` still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - no `Policy recent exits`
  - no `Policy retention candidates`
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
  - `recent_policy_exits`
  - `retention_candidates`
  - `policy_history_recent_events`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 26 Audit Delta

This audit specifically verified that Phase 26 keeps the post-Phase-25 governance surface unchanged while strengthening consistency proof and documentation around that supported baseline.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` still exposes only:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- `worklist` still emits one policy item at a time
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 25
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - no compact policy counts
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
  - `recent_policy_exits`
  - `retention_candidates`
  - `policy_history_recent_events`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 27 Audit Delta

This audit specifically verified that Phase 27 keeps the supported post-Phase-26 governance surface unchanged while simplifying the human-readable operator policy reporting.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` still exposes only:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- `worklist` still emits one policy item at a time
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 26
- no new mutation surface was added
- no policy report or status JSON contract changed

Confirmed live outcomes:

- live `status --json` still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - no competing governance mini-dashboard
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
  - `recent_policy_exits`
  - `retention_candidates`
  - `policy_history_recent_events`
- live human-readable `recommendation policy` now keeps the same supported sections while using less repetitive summary labels such as:
  - `Active proposed summary`
  - `Recent exit summary`
  - `Retention summary`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 28 Audit Delta

This audit specifically verified that Phase 28 keeps the supported post-Phase-27 governance surface unchanged after live evidence review, and that the only resulting code change is a tiny human-readable cleanup in the operator policy report.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` still exposes only:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- `worklist` still emits one policy item at a time
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 27
- no new mutation surface was added
- no policy report or status JSON contract changed

Confirmed live outcomes:

- live `status --json` still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - no competing governance mini-dashboard
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind`
  - `policy_attention_summary`
  - `policy_attention_command`
  - `recent_policy_exits`
  - `retention_candidates`
  - `policy_history_recent_events`
- live human-readable `recommendation policy` now keeps the same supported sections while replacing lingering repeated summary labels with lighter cue labels such as:
  - `Proposed cue`
  - `Recent exit cue`
  - `Retention cue`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 29 Audit Delta

This audit specifically verified that Phase 29 keeps the supported post-Phase-28 governance surface unchanged and limits the code change to formatter-only suppression of empty cue rows in human-readable `recommendation policy`.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` still exposes only:
  - `policy_attention_kind`
  - `top_policy_attention_summary`
- `worklist` still emits one policy item at a time
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 28
- no new mutation surface was added
- no policy report, status JSON, worklist JSON, or audit contract changed

Confirmed live outcomes:

- live `status --json` still returns:
  - `state = "ready"`
  - `schema.current_version = 14`
  - `schema.expected_version = 14`
  - `planning_recommendations.policy_attention_kind = "recent_exit"`
  - populated `planning_recommendations.top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - no competing governance mini-dashboard
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `policy_attention_summary`
  - `policy_attention_command = "personal-ops recommendation policy"`
  - `recent_policy_exits = 1`
  - `retention_candidates = 0`
  - `policy_history_recent_events = 0`
- live human-readable `recommendation policy` keeps the same supported sections and now shows only meaningful cue rows
  - current steady state includes:
    - `Recent exit cue`
- live `worklist --json` still emitted only one policy item in steady state
  - current steady state includes:
    - `planning_policy_governance_needed`
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 30 Audit Delta

This audit specifically verified that Phase 30 keeps the supported post-Phase-29 governance surface unchanged and that fresh live review does not justify any further governance-surface code change.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy` remains the detailed operator governance surface
- `status` remains the compact primary attention surface
- `worklist` still emits one policy item at a time
- assistant-safe audit remains the same fixed categorized feed from Phase 20 through Phase 29
- no new mutation surface was added
- no policy report, status JSON, worklist JSON, or audit contract changed
- no code change was needed in this phase

Confirmed live outcomes:

- live `status --json` still returns:
  - `state = "ready"`
  - `schema.current_version = 14`
  - `schema.expected_version = 14`
  - `planning_recommendations.policy_attention_kind = "recent_exit"`
  - populated `planning_recommendations.top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
  - no competing governance mini-dashboard
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `policy_attention_summary`
  - `policy_attention_command = "personal-ops recommendation policy"`
  - `recent_policy_exits = 1`
  - `retention_candidates = 0`
  - `policy_history_recent_events = 0`
- live human-readable `recommendation policy` remains quiet enough for steady-state use
  - current steady state includes only:
    - `Recent exit cue`
- live `worklist --json` still emitted only one policy item in steady state
  - current steady state includes:
    - `planning_policy_governance_needed`
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live operator `GET /v1/audit/events?limit=5` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 31 Audit Delta

This audit specifically verified that Phase 31 adds one narrow assistant-safe audit ergonomics improvement without changing the default feed, the safe event set, or the operator-versus-assistant trust boundary.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- `recommendation policy`, `status`, and `worklist` remain unchanged in contract and scope
- assistant-safe audit keeps the same safe event families and the same redaction behavior as before
- existing audit reads now accept an optional single-category filter:
  - `sync`
  - `task`
  - `task_suggestion`
  - `planning`
- operator audit remains raw
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` still returns:
  - `state = "ready"`
  - `schema.current_version = 14`
  - `schema.expected_version = 14`
  - `planning_recommendations.policy_attention_kind = "recent_exit"`
  - populated `planning_recommendations.top_policy_attention_summary`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
- live `recommendation policy --json` remains unchanged in scope and still returns:
  - `policy_attention_kind = "recent_exit"`
  - populated `policy_attention_summary`
  - `policy_attention_command = "personal-ops recommendation policy"`
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe `GET /v1/audit/events?limit=5` stayed unchanged in scope and still returned categorized safe events only
- live assistant-safe `GET /v1/audit/events?limit=5&category=planning` returned only planning events
- live assistant-safe `GET /v1/audit/events?limit=5&category=task` returned only task events
- live assistant-safe `GET /v1/audit/events?limit=5&category=sync` returned only sync events
- live operator `GET /v1/audit/events?limit=5&category=sync` stayed raw
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 32 Audit Delta

This audit specifically verified that Phase 32 does not need another audit-surface expansion and that the current default-plus-single-category model is sufficient in real usage across both HTTP and MCP reads.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- no code-path change was needed in this phase
- `recommendation policy`, `status`, and `worklist` remain unchanged in contract and scope
- assistant-safe audit keeps the same safe event families and the same redaction behavior
- the existing optional single-category filter remains the only supported audit query dimension
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` still returns:
  - `state = "ready"`
  - `schema.current_version = 14`
  - `schema.expected_version = 14`
  - `planning_recommendations.policy_attention_kind = "recent_exit"`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
- live `recommendation policy --json` remains unchanged in scope
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe default HTTP audit reads remained useful as a general recent-activity view but still skewed toward sync events
- live assistant-safe filtered planning and task HTTP reads removed the sync-noise pain point cleanly
- live assistant-safe filtered `task_suggestion` HTTP reads remained coherent even with a smaller slice
- live operator filtered sync HTTP reads stayed raw
- live MCP `audit_events_recent(limit=5)` matched the default HTTP behavior
- live MCP `audit_events_recent(limit=5, category=\"planning\")`, `category=\"task\"`, and `category=\"sync\"` matched the filtered HTTP behavior
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

## Phase 33 Audit Delta

This audit specifically verified that the current default-plus-single-category audit model remains sufficient even under fresh wider-slice review and that any remaining desire for broader audit queries is convenience rather than a real defect.

Confirmed architectural outcomes:

- schema stays at `14`
- ranking stays at `phase12-v1`
- no code-path change was needed in this phase
- `recommendation policy`, `status`, and `worklist` remain unchanged in contract and scope
- assistant-safe audit keeps the same safe event families and the same redaction behavior
- the existing optional single-category filter remains the only supported audit query dimension
- no new mutation surface was added

Confirmed live outcomes:

- live `status --json` still returns:
  - `state = "ready"`
  - `schema.current_version = 14`
  - `schema.expected_version = 14`
  - `planning_recommendations.policy_attention_kind = "recent_exit"`
- live human-readable `status` still returns:
  - one primary `Policy attention` line
- live `recommendation policy --json` remains unchanged in scope
- live `worklist --json` still emitted only one policy item in steady state
- live assistant-safe default HTTP audit reads at both `limit=5` and `limit=20` remained useful as general recent-activity views while still skewing toward sync events
- live assistant-safe filtered planning and task HTTP reads at `limit=20` removed the sync-noise pain point cleanly
- live assistant-safe filtered `task_suggestion` HTTP reads at `limit=20` remained coherent even with a smaller slice
- live assistant-safe filtered sync HTTP reads at `limit=20` stayed limited to sync events
- live operator filtered sync HTTP reads at `limit=20` stayed raw
- live invalid HTTP category values still failed validation cleanly
- live MCP `audit_events_recent(limit=5)` and `limit=20` matched the default HTTP behavior
- live MCP filtered `planning`, `task`, `task_suggestion`, and `sync` reads at `limit=20` matched the filtered HTTP behavior
- final settled live health returned:
  - `status.state = "ready"`
  - `doctor --deep = 38 pass / 0 warn / 0 fail`

Post-program audit follow-up outcomes:

- HTTP `GET /v1/audit/events` now rejects unsupported query params such as `action`, `target_type`, `target_id`, and `client`
- MCP `audit_events_recent` now exposes only `limit` and optional `category`
- the supported audit model is now both documented and enforced as default recent-activity feed plus optional single-category filter

## Current Architecture

### Control plane

- daemon: shared runtime owner
- SQLite: shared source of truth
- CLI: operator interface
- MCP: assistant interface
- LaunchAgent: persistence and restart behavior

### Shared domains now present

- review queue
- approval queue
- send policy and timed send windows
- inbox metadata and thread state
- tasks
- task suggestions
- calendar metadata and read views
- operator-controlled calendar events
- task-calendar linkages
- planning recommendations
- ranked planning groups
- recommendation outcomes and slot states
- recommendation lifecycle analytics
- advisory planning hygiene signals
- operator-reviewed hygiene triage
- explicit hygiene policy proposal records
- explicit policy governance history
- audit events
- snapshots
- worklist

### Assistant model

Codex:

- MCP server registered in Codex config
- wrapper sets Codex-specific identity

Claude:

- user-scoped `personal-ops` MCP registration
- wrapper sets Claude-specific identity
- direct Gmail remains installed, but shared workflows are meant to go through `personal-ops`

Shared contract:

- read through shared surfaces
- mutate only where permitted
- operators keep dangerous actions
- assistants stay suggestion-first for planning

### Governance surface map

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact system summary with primary policy attention
- `worklist`: one-at-a-time attention prompt, not a governance dashboard
- assistant-safe audit: categorized operational context feed with an optional single-category filter on the existing safe categories
- hygiene and tuning: assistant-safe explanation surfaces for planning state, not policy-governance control surfaces

## Key Invariants That Are Holding

These are the most important invariants confirmed by audit:

1. One shared source of truth
   - mail, inbox, tasks, calendar, scheduling, and planning all live in the same control plane

2. Read paths are safe
   - health/status/worklist and inbox/calendar/planning reads do not create or normalize state

3. Send stays guarded
   - send remains off by default
   - approvals and confirmations still gate dangerous actions

4. Assistant boundaries still hold
   - assistants do not get operator-only tools
   - calendar mutation remains operator-only
   - planning recommendation apply/reject/snooze/replan remains operator-only

5. Cross-assistant attribution works
   - Codex and Claude remain distinguishable at the MCP boundary

6. Recovery posture exists
   - snapshots are supported
   - audit trail is present
   - doctor and status meaningfully reflect system health

7. Planning quality improvements stay inside the existing model
   - grouped reads are derived
   - ranking is deterministic
- hygiene reporting is advisory-only
- hygiene review state is audit-derived and operator-reviewed, not schema-backed suppression state
- hygiene proposal state is explicit and schema-backed, but still non-enforcing
- policy governance history is explicit and schema-backed, but still non-enforcing
- grouped mutations stay narrow and operator-only
- no direct provider fallback was introduced

## Findings

### Resolved implementation findings

During Phase 9 through Phase 15 implementation and audit, the most meaningful planning-layer issues were found and fixed before final rollout:

1. schema compatibility preflight originally checked only a subset of the new Phase 9 planning columns
2. `replan` could report success without changing the slot
3. the `end-of-day` snooze preset could resolve into the past after work hours
4. grouped HTTP planning reads and operator-only `replan` originally lacked direct transport-layer coverage
5. schema expectations in DB tests still targeted Phase 9 version numbers after Phase 10 landed
6. one worklist test assumed raw scheduling-pressure items instead of the now-preferred planning layer
7. grouped detail originally disappeared after a grouped reject because detail reads only considered unresolved rows
8. the first task-outcome integration test needed a writable calendar stub to exercise scheduling behavior correctly
9. the source tree had drifted into partial Phase 11 scaffolding and no longer built cleanly
10. an early refresh inside the apply flow could overwrite a later `task_completed` closure with `source_resolved`
11. resurfaced-source analytics originally depended too much on row insert timing
12. top-level status totals still mixed active and historical recommendation rows in a way that overstated the live queue
13. ranking metadata still reported `phase10-v1` after the Phase 12 calibration logic landed
14. early Phase 13 closure-meaning summaries could contradict the advisory recommendation when closure evidence tied across families
15. one long-lived task-block apply test still depended on a narrow time-of-day slot and could fail late in the day
16. the Phase 14 CLI hygiene review command initially let the parent hygiene command consume nested `--group`, `--kind`, `--source`, and `--json` flags
17. early Phase 15 test coverage initially inherited more planning-test time-of-day drift than expected and needed wider workday fixtures plus follow-through fixture cleanup before the suite became stable again

Resolution:

- expanded schema compatibility checks to cover the full planning column set
- prevented `replan` no-op success and added a no-alternate-slot regression test
- rolled `end-of-day` snooze forward to a future workday boundary when needed
- added HTTP coverage for grouped reads, next-action reads, and assistant rejection of operator-only planning mutations
- updated DB migration expectations for schema `11`
- aligned worklist tests with the planning-layer-first behavior
- kept grouped detail readable after grouped reject for audit and operator clarity
- fixed the task-outcome integration harness so linked recommendation outcomes could be verified reliably
- reconciled the partial Phase 11 tree and restored a clean build before rollout
- prevented refresh from overwriting an already-correct closure reason during apply flows
- keyed resurfaced detection to recent closure timing instead of fragile row creation ordering
- split active and historical totals explicitly in status while keeping total counts for compatibility
- refreshed live ranking metadata to `phase12-v1` after the calibration rollout
- treated tied closure evidence as mixed so advisory wording stays consistent with the recommendation thresholds
- stabilized the task-block apply harness so it no longer depends on a barely-open calendar gap
- resolved nested hygiene-review CLI flags explicitly so the documented review command and `--json` output work live
- widened the remaining time-sensitive planning tests, tightened the Phase 15 fixture so it no longer closes the open family under test, and re-ran the full suite repeatedly until it held at `65/65`

### Remaining blocking findings

None.

## Residual Risks and Watch Items

These are not failures. They are the main things to keep in mind as the system grows.

### 1. Planning recommendation noise

A durable, grouped, and now hygiene-aware queue is more useful than ephemeral signals, but it can still become noisy if recommendation volume rises.

Recommendation:

- watch pending recommendation counts and group sizes
- use the new hygiene and closure views before adding more recommendation kinds
- keep any future suppression work operator-reviewed and explicit rather than automatic

### 2. Slot quality is still heuristic

Phase 9 improves ordering and operability, but slot selection still uses fixed durations and deterministic fit rules rather than effort-aware planning.

Recommendation:

- keep duration estimation and more advanced ranking for a later phase

### 3. Active-versus-history clarity now depends on formatter discipline

Phase 12 resolved the old active-versus-history ambiguity, but some historical-heavy queues can still look larger than they feel if operators read only the total count and not the new split.

Recommendation:

- keep future formatter and client work centered on active-first wording so the split counts remain obvious

### 4. Calendar sync remains intentionally simple

Calendar sync still uses bounded rolling-window replacement rather than a more advanced delta model.

Recommendation:

- revisit only if calendar count, event volume, or sync frequency creates real pressure

## Files and Contracts That Matter Most

Core docs:

- `/Users/d/.local/share/personal-ops/README.md`
- `/Users/d/.local/share/personal-ops/CLIENTS.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-8-HANDOFF.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-9-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-9-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-10-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-10-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-11-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-11-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-12-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-12-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-13-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-13-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-14-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-14-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-15-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-15-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-16-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-16-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-17-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-17-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-18-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-18-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-19-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-19-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-20-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-20-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-21-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-21-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-22-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-22-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-23-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-23-ROLLOUT.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-24-PLAN.md`
- `/Users/d/.local/share/personal-ops/docs/PHASE-24-ROLLOUT.md`

Core implementation:

- `/Users/d/.local/share/personal-ops/app/src/service.ts`
- `/Users/d/.local/share/personal-ops/app/src/db.ts`
- `/Users/d/.local/share/personal-ops/app/src/http.ts`
- `/Users/d/.local/share/personal-ops/app/src/cli.ts`
- `/Users/d/.local/share/personal-ops/app/src/mcp-server.ts`
- `/Users/d/.local/share/personal-ops/app/src/daemon.ts`
- `/Users/d/.local/share/personal-ops/app/src/types.ts`
- `/Users/d/.local/share/personal-ops/app/src/formatters.ts`

Tests:

- `/Users/d/.local/share/personal-ops/app/test/service.test.ts`
- `/Users/d/.local/share/personal-ops/app/test/db.test.ts`

Assistant integration references:

- `/Users/d/.codex/config.toml`
- `/Users/d/.codex/bin/personal-ops-mcp`
- `/Users/d/.claude.json`
- `/Users/d/.claude/bin/personal-ops-mcp`
- `/Users/d/.claude/rules/personal-ops.md`

## Current Recommendation

Phase 33 is complete and live.

The system now has a planning layer that is durable, ranked, grouped, explainable, outcome-aware, closure-aware, active-versus-history aware, hygiene-aware, operator-reviewable, explicit-proposal-aware, operator-tuning-aware, policy-governance-aware, assistant-audit-aware, and retention-aware enough to support both execution and backlog refinement on the shared machine. The governance surfaces still have the same supported baseline: `recommendation policy` for detailed operator governance, `status` for compact primary attention, `worklist` for one-at-a-time attention, and assistant-safe audit for categorized operational context. Phase 33 confirms that the current audit model remains sufficient after fresh wider-slice HTTP and MCP review: default recent-activity feed plus an optional single-category filter, with no broader query surface needed and no runtime change justified.

The full end-of-program reference now lives in:

- `/Users/d/.local/share/personal-ops/docs/PROGRAM-COMPLETE-SUMMARY.md`

One non-blocking follow-up remains:

- no planned audit-surface work should proceed unless fresh evidence shows a concrete new pain point

## Next Phase Docket

The next sensible phase is Phase 34: no planned audit-surface work; revisit only if fresh usage evidence shows a concrete new pain point.

Recommended focus:

- keep the current supported machine-readable surfaces and trust boundaries intact unless later evidence justifies a narrower change
- revisit audit ergonomics only if later evidence shows the current default-plus-single-category model is no longer sufficient
- prefer targeted follow-up over broader filtering or new audit query surfaces unless evidence clearly requires it
- revisit governance surfaces only if fresh usage evidence shows a concrete pain point
- continue preserving the same suggestion-first trust boundaries

What should still stay out of scope unless a later plan explicitly changes it:

- direct assistant calendar writes
- automatic application of recommendations without operator action
- guest invite workflows
- Meet link management
- recurring event scheduling
