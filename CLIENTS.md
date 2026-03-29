# personal-ops Client Contract

`personal-ops` is the machine-level source of truth for shared mail, inbox awareness, review, approval, tasks, calendar awareness, operator scheduling, worklist, and diagnostics.

Assistants are clients of this system. They must not implement provider-side mail logic on their own.

For general repo orientation, start with [START-HERE.md](START-HERE.md).

For the fastest role-based onboarding, read [QUICK-GUIDE.md](QUICK-GUIDE.md) before using the rest of this contract.

## MCP identity env vars

The shared MCP bridge reads assistant identity from these optional environment variables:

- `PERSONAL_OPS_CLIENT_ID`
- `PERSONAL_OPS_REQUESTED_BY`
- `PERSONAL_OPS_ORIGIN`

Defaults remain backward compatible with the original Codex path:

- `PERSONAL_OPS_CLIENT_ID=codex-mcp`
- `PERSONAL_OPS_REQUESTED_BY=codex`
- `PERSONAL_OPS_ORIGIN=assistant-mcp`

Typical wrappers:

- Codex wrapper sets `codex-mcp` / `codex`
- Claude wrapper sets `claude-mcp` / `claude`

## Shared read surfaces

Planning recommendation reads now include ranking, grouping, trigger/suppression context, slot reason, source freshness, outcome state, slot state, next-action context, active-versus-history clarity, filtered analytics, derived closure signals, queue-share context, advisory hygiene summaries, audit-derived review-needed state, and follow-through visibility so assistants can explain queue state without mutating it. `planning_recommendation_hygiene` remains read-safe and now supports `review_needed_only` filtering plus the follow-through states `review_needed`, `reviewed_fresh`, `reviewed_stale`, `proposal_open`, `proposal_stale`, and `proposal_dismissed`.

- `personal_ops_status`
- `personal_ops_doctor`
- `personal_ops_worklist`
- `github_status`
- `github_reviews`
- `github_pulls`
- `github_pull_get`
- `drive_status`
- `drive_files`
- `drive_doc_get`
- `send_window_status`
- `inbox_status`
- `inbox_unread_list`
- `inbox_followup_list`
- `inbox_needs_reply_list`
- `inbox_recent_list`
- `inbox_thread_get`
- `calendar_status`
- `calendar_calendars_list`
- `calendar_upcoming_list`
- `calendar_conflict_list`
- `calendar_free_time_get`
- `calendar_day_get`
- `calendar_event_get`
- `review_queue_pending`
- `review_queue_get`
- `approval_queue_list`
- `approval_queue_pending`
- `approval_queue_get`
- `task_list`
- `task_get`
- `task_due_list`
- `task_overdue_list`
- `task_suggestion_list`
- `task_suggestion_get`
- `planning_recommendation_list`
- `planning_recommendation_get`
- `planning_recommendation_group_list`
- `planning_recommendation_group_get`
- `planning_recommendation_next`
- `planning_recommendation_summary`
- `planning_recommendation_tuning`
- `planning_recommendation_backlog`
- `planning_recommendation_closure`
- `planning_recommendation_hygiene`
- `review_queue_list`
- `audit_events_recent`

## Shared mutation surfaces

- `mail_draft_create`
- `mail_draft_update`
- `approval_request_create`
- `approval_request_approve`
- `approval_request_reject`
- `approval_request_send`
- `task_suggestion_create`
- `planning_recommendation_create`

`planning_recommendation_create` remains limited to assistant-created `schedule_task_block` suggestions for existing tasks. Follow-up and prep recommendations remain system-generated.

## Operator-only boundaries

These remain outside assistant control:

- review opening in the browser
- inbox sync mutation
- calendar sync mutation
- calendar event create/update/cancel
- task scheduling and unscheduling on the calendar
- planning recommendation apply/reject/snooze/refresh
- planning recommendation replan
- planning recommendation group snooze/reject
- planning hygiene review mutation
- planning hygiene proposal record/dismiss mutation
- planning policy archive/supersede mutation
- planning policy prune mutation
- planning policy governance reads
- GitHub auth login and logout
- explicit GitHub sync mutation
- any GitHub write action
- send-window enable/disable
- approval reopen/cancel
- review resolve
- task creation, task completion, task cancellation, task snooze, and suggestion accept/reject
- follow-up or prep task creation outside the recommendation flow
- confirmation-token issuance
- any live send without operator-provided confirmation

## Client rule

Assistants must use `personal-ops` for shared mailbox, task, calendar, supported GitHub PR and review workflows, and supported Drive/Docs context. If `personal-ops` is unavailable, they should report the issue instead of falling back to direct Gmail, direct calendar access, direct GitHub write flows, direct Google Docs reads, or another parallel provider path.

Phase 7 adds assistant-safe GitHub PR and review reads only:

- GitHub.com only
- explicit repository opt-in by the operator
- PR and review queue context only
- no GitHub write actions
- no issue ingestion

Phase 8 adds assistant-safe Google Docs and Drive metadata reads only:

- Google Docs plus Drive metadata only
- explicit scope chosen by the operator
- explicit stored links first, with only a small recent-doc fallback
- no Google write actions
- no Sheets, Slides, or Shared Drives

Phase 23 keeps that rule intact while treating the current governance surfaces as the supported baseline. Assistants may inspect hygiene families, review-needed counts, follow-through state, safe tuning attention detail, grouped planning summaries, group detail, recommendation provenance, next-action recommendations, derived summary/backlog/closure/hygiene/tuning reports, and assistant-safe audit summaries, but they still do not apply, reject, snooze, replan, mutate recommendation groups, review hygiene families, record or dismiss hygiene proposals, archive, supersede, or prune policy governance, read the operator-only policy report, create active suppression state, hide recommendations, or directly calendar-write those recommendations.

Phase 19 hygiene, policy governance, audit shaping, grouped policy-history reporting, and calibration stay trust-boundary safe:

- calibration still applies only to system-generated recommendations
- calibration still changes rank ordering and explanation text only
- hygiene reporting remains advisory-only and derived from existing recommendation rows plus audit history
- hygiene review records operator intent but does not suppress, hide, close, or resolve recommendations
- hygiene policy proposals are explicit operator-owned records, but they remain non-enforcing and do not suppress, hide, close, resolve, or rerank recommendations
- planning policy governance history is explicit and operator-only, but it remains non-enforcing and does not suppress, hide, close, resolve, or rerank recommendations
- Phase 19 grouped policy-history families are derived operator-only summaries built from raw governance events; they do not create durable compression state or change policy-governance mutation semantics
- assistants may read `review_needed_only` hygiene results, safe tuning attention detail, and proposal status metadata, but proposal note, proposal attribution, review note, and review attribution are redacted and `recently_closed_families` stays operator-only
- assistants may still read recommendation detail, but planning hygiene/proposal/policy governance audit history is now stripped from assistant-safe `related_audit_events`
- assistants may still call `audit_events_recent`, but the safe event set remains fixed and sensitive/operator-only action families are omitted while visible events return sanitized metadata plus short summaries in these explicit categories:
  - `sync`
  - `task`
  - `task_suggestion`
  - `planning`
- Phase 31 keeps that safe event set unchanged and adds one optional read-only filter to `audit_events_recent` and `GET /v1/audit/events` so assistants can isolate one of those same categories without widening visibility
- `recommendation policy` remains operator-only, and Phase 23 now treats it as the supported detailed governance surface with `policy_history_recent_events` as the raw-governance drill-down field
- compact policy attention in `status` and `worklist` remains intentionally simplified, Phase 23 consolidates the derivation so `recommendation policy`, `status`, and `worklist` stay aligned without changing the public surface, Phase 24 keeps the remaining compact policy counts as machine-readable context while de-emphasizing them in human-readable `status`, and Phase 25 removes those last compact counts so `status` now carries only the primary policy-attention fields
- Phase 26 keeps that simplified model unchanged and confirms it as the supported baseline: `recommendation policy` for detail, `status` for compact primary attention, `worklist` for one-at-a-time prompting, and assistant-safe audit as a fixed categorized feed
- Phase 27 keeps that supported baseline intact while simplifying only the human-readable governance wording so operators get a clearer detailed view without any contract or trust-boundary change
- Phase 28 keeps that supported baseline intact after live evidence review across `recommendation policy`, `status`, `worklist`, and assistant-safe audit, and it trims one remaining layer of repeated policy-report summary wording without changing contracts or trust boundaries
- Phase 29 keeps that supported baseline intact and suppresses empty cue rows in human-readable `recommendation policy`, so the detailed operator surface stays quieter without changing any machine-readable contract, trust boundary, or assistant-safe audit behavior
- Phase 30 keeps that supported baseline intact and confirms through fresh live review that no further governance-surface code change is currently justified; `recommendation policy`, `status`, `worklist`, and assistant-safe audit all keep the same contract and trust posture
- Phase 31 keeps that supported baseline intact while adding an additive single-category audit filter for `sync`, `task`, `task_suggestion`, or `planning`, with the same default feed, the same safe event set, and the same operator-versus-assistant shaping
- Phase 32 keeps that supported baseline intact while confirming through live HTTP and MCP review that the default feed plus optional single-category filter is sufficient for now and does not justify a broader audit query surface
- Phase 33 keeps that supported baseline intact while re-validating the same audit model at both short and wider slices, confirming that it remains sufficient and that any remaining desire for broader audit queries is convenience rather than a defect
- the post-program audit follow-up now enforces that supported audit contract in the live HTTP and MCP entry points, so unsupported audit query params are rejected instead of remaining accidentally available
- send remains operator-gated
- calendar mutation remains operator-only

Supported governance surface map:

- `recommendation policy`: operator-only detailed governance surface
- `status`: compact health and primary attention surface
- `worklist`: one-at-a-time attention surface
- `audit_events_recent`: assistant-safe categorized operational context with an optional single-category filter, not a full raw audit browser
- hygiene and tuning reads: assistant-safe explanation surfaces for planning state, not policy-governance control surfaces

Supported audit inputs are intentionally narrow:

- HTTP `GET /v1/audit/events`: `limit` and optional `category`
- MCP `audit_events_recent`: `limit` and optional `category`

Supported audit usage examples:

- default quick recent activity:
  - `audit_events_recent(limit=5)`
- default wider recent activity:
  - `audit_events_recent(limit=20)`
- focused planning context:
  - `audit_events_recent(limit=20, category="planning")`
- focused task context:
  - `audit_events_recent(limit=20, category="task")`
- focused task-suggestion context:
  - `audit_events_recent(limit=20, category="task_suggestion")`

The `category` filter narrows already-visible events only. It does not reveal new event families and it does not change assistant-safe redaction or operator raw audit behavior.
