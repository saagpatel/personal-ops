# personal-ops

`personal-ops` is a neutral machine-level control plane for shared assistant services on this Mac.

New machine setup guide:

- [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md) walks through cloning this repo onto another Mac, installing dependencies, configuring OAuth, adding wrappers, and starting the daemon safely.

## If You're New Here

The simplest way to understand `personal-ops` is:

it is a private operating layer for your personal workflow.

That means it sits between:

- your real tools, like Gmail and Google Calendar
- your assistants, like Codex or Claude
- and your actual decisions, like whether to send something, schedule something, or change how the system behaves

`personal-ops` is not an assistant that runs your life on its own.

It is a structured local system that:

- syncs your inbox and calendar so the machine has current context
- stores tasks, task suggestions, reviews, approvals, planning recommendations, and audit history in one place
- gives assistants safe read access to that shared state
- keeps risky actions behind operator control
- records what happened so the system stays inspectable

In plain English:

- assistants can help
- the operator stays in charge

### A beginner example

Suppose an email arrives that probably needs a reply.

`personal-ops` can:

- notice that through mailbox sync
- store the thread state locally
- create a planning recommendation like “set aside time to reply”
- show that recommendation to an assistant in a safe way
- let the assistant explain the situation

But it does not automatically let the assistant:

- send a live reply
- rewrite your calendar freely
- change policy or governance rules

That split is the core idea of the whole system.

### What the “personal OS” idea really means

When we call this a “personal OS,” we do not mean a literal new operating system.

We mean:

- one local source of truth for your personal workflow state
- one shared control plane for assistants
- one trust model for deciding what is safe to read and what must stay operator-only

Without this layer, every assistant would have to invent its own Gmail logic, calendar logic, task logic, and safety rules. That would be messy, inconsistent, and hard to trust.

With `personal-ops`, there is one shared system that:

- knows the current state
- exposes supported read surfaces
- protects risky mutations
- keeps an audit trail

### The final supported surface map

By the end of the program, the steady-state model is:

- `recommendation policy`
  - the detailed operator-only governance surface
- `status`
  - the compact “how is the system doing?” surface
- `worklist`
  - the next-attention surface
- assistant-safe audit
  - the safe recent-activity feed for assistants

So the practical version is:

- `status` tells you how things are doing
- `worklist` tells you what needs attention
- `recommendation policy` gives the operator the deeper governance view
- assistant-safe audit gives assistants safe recent context without exposing everything

Program-complete reference:

- `docs/PROGRAM-COMPLETE-SUMMARY.md` captures the full Phase 1 through Phase 33 story, the final supported baseline, the trust model, and why the program is considered complete for now.

Phase 1 includes:

- local daemon on `127.0.0.1:46210`
- Gmail installed-app OAuth flow
- Gmail draft create/update only
- local SQLite audit + review queue
- macOS Notification Center alerts
- CLI and Codex MCP access

Phase 1.5 adds:

- `personal-ops status`
- `personal-ops doctor [--deep]`
- review detail and pending review commands
- filtered human-readable audit output
- local snapshots for recovery

Phase 2 adds:

- approval-gated send flow
- explicit approval queue with pending, approved, rejected, expired, sending, sent, and send_failed states
- draft-based Gmail send through `users.drafts.send`
- operator-issued confirmation tokens for approve/send mutations through MCP
- dark-launch send control through `allow_send`

Phase 2.5 adds:

- timed send windows for supervised live sends without editing policy files
- `personal-ops worklist` as the main attention surface
- explicit recovery commands for failed approvals and stale review items
- daemon reminder sweeps for expiring approvals, expiring send windows, and degraded service state

Phase 2.6 and Phase 3 add:

- operator-only `review open` with assistant-safe review reads
- non-mutating health, status, worklist, and approval read paths
- daemon-owned runtime normalization for stale sends and expired send windows
- metadata-only Gmail inbox awareness using `gmail.compose + gmail.metadata`
- local mailbox sync state, thread index, and message header index
- sync metrics, derived thread-state views, and inbox-aware status reporting
- inbox-aware worklist items for unread threads, stale follow-ups, reply-needed threads, and degraded sync state

Phase 4 adds:

- assistant-specific MCP identity headers for shared audit attribution
- a shared client contract for Codex and Claude in `CLIENTS.md`
- Claude parity with the existing shared draft and approval-request workflow
- explicit cross-assistant expectation that both tools are clients of `personal-ops`, not owners of provider logic

Phase 5 adds:

- internal-only tasks and reminders stored in the local `personal-ops` SQLite database
- a separate task suggestion queue so assistants can suggest work without silently committing it
- task-aware worklist and reminder notifications for due, overdue, reminder-due, and stale task states
- operator task flows through CLI and HTTP, with assistant-safe suggestion creation through MCP

Phase 6 adds:

- metadata-only Google Calendar awareness through the shared Google OAuth client
- local calendar source and event indexing with bounded rolling-window sync
- calendar-aware worklist items for upcoming events, conflicts, overloaded days, and task schedule pressure
- operator calendar views through CLI and HTTP, with assistant-safe calendar reads through MCP

Phase 7 adds:

- operator-only Google Calendar event creation, update, and cancel flows on owned calendars
- task-to-calendar scheduling with one active linked event per task
- local event mutation tracking, provider etag safety checks, and `personal-ops` event provenance
- scheduling-aware worklist items for unscheduled urgent tasks, scheduled conflicts, and stale reserved task blocks
- calendar write readiness checks in `status` and `doctor`

Phase 8 adds:

- durable planning recommendations for task blocks, inbox follow-up blocks, and meeting prep blocks
- system-owned recommendation refresh across inbox, task, calendar, and worklist state
- operator apply, reject, snooze, and refresh flows for planning recommendations
- assistant-safe planning recommendation reads plus assistant-created task scheduling recommendations
- worklist and status integration that prefers active planning recommendations over duplicate low-level planning signals

Phase 9 adds:

- deterministic recommendation ranking with persisted score, reason, and ranking version
- grouped planning summaries in `worklist`, `status`, and grouped recommendation reads
- richer recommendation explanation and provenance, including trigger signals, suppressed signals, slot reason, and source freshness
- operator-only `recommendation replan` plus snooze presets and reject reason codes
- daemon startup preflight for schema compatibility and stronger migration safety diagnostics

Phase 10 adds:

- recommendation outcome tracking for `scheduled`, `completed`, `canceled`, `dismissed`, `handled_elsewhere`, and `source_resolved`
- explicit slot-state tracking so recommendations can say when they need manual scheduling
- collision-aware grouped planning so same-group items do not all claim the same window silently
- operator-first grouped recommendation reads through `recommendation group show` and `recommendation next`
- low-risk grouped operator actions for `recommendation group snooze` and `recommendation group reject`
- worklist shaping that keeps the planning group visible while capping duplicate raw child items

Phase 11 adds:

- recommendation lifecycle analytics for first action, closure timing, close reason, and closer attribution
- derived planning summary, backlog, and closure reports across CLI, HTTP, and assistant-safe MCP reads
- richer planning throughput context in `status` and grouped recommendation detail, including stale counts, resurfaced-source counts, and median timing
- operator-facing planning summaries that stay read-only and preserve existing operator versus assistant trust boundaries

Phase 12 adds:

- explicit active-versus-history counts in `status` for tasks, task suggestions, and planning recommendations
- filtered planning backlog and closure analytics across CLI, HTTP, and assistant-safe MCP reads
- group-level closure-mix context for backlog and grouped recommendation detail
- conservative, derived planning ranking calibration from recent closure outcomes for system-generated recommendations only
- planning hygiene summaries that stay read-only and preserve the existing operator versus assistant trust boundaries

Phase 13 adds:

- advisory `recommendation hygiene` reporting across CLI, HTTP, and assistant-safe MCP reads
- queue-share and dominance visibility for active planning backlog groups
- explicit suppression-candidate summaries in `status` and planning summary reads
- clearer closure-meaning summaries that distinguish handled-elsewhere patterns from source-side resolution and mixed evidence
- advisory-only backlog-hygiene tuning that does not add suppression state, auto-hide behavior, or any new mutation surface

Phase 14 adds:

- operator-reviewed hygiene triage derived from audit history rather than new schema state
- operator-only `recommendation hygiene review` mutation across CLI and HTTP
- assistant-safe hygiene reads now support `review_needed_only`
- `status` and `recommendation summary` now surface review-needed counts and top review-needed summaries
- `worklist` stays item-based and raises a hygiene review-needed item when attention is required
- ranking remains `phase12-v1` and schema remains `12`

Phase 15 adds:

- explicit operator-only hygiene policy proposals stored as durable family-scoped records
- reviewed-family follow-through states across hygiene reads: `review_needed`, `reviewed_fresh`, `reviewed_stale`, `proposal_open`, `proposal_stale`, and `proposal_dismissed`
- `recommendation tuning` reads across CLI, HTTP, and assistant-safe MCP access
- operator-only `recommendation hygiene proposal record` and `recommendation hygiene proposal dismiss` mutation across CLI and HTTP
- additive schema upgrade to `13` while keeping ranking at `phase12-v1`

Phase 16 adds:

- operator-facing `recommendation tuning` triage sections for active `attention_families` and compact operator `recently_closed_families`
- assistant-safe hygiene redaction for `proposal_note`, `proposal_by_client`, and `proposal_by_actor`
- assistant-safe tuning that keeps active attention visible but omits operator-only recent-history rows
- follow-through worklist pressure only for `review_needed`, `reviewed_stale`, and `proposal_stale`
- no schema change and no ranking-version change beyond Phase 15

Phase 17 adds:

- explicit append-only policy governance events for inactive hygiene-policy families
- operator-only `recommendation policy` reads plus `policy archive` and `policy supersede` mutation across CLI and HTTP
- additive schema upgrade to `14` while keeping ranking at `phase12-v1`
- assistant-safe hygiene redaction for operator review attribution and review note
- assistant-safe planning recommendation detail redaction for hygiene/proposal/policy audit history

Phase 18 adds:

- assistant-safe `audit_events_recent` and `GET /v1/audit/events` shaping with least-privilege summaries and sanitized metadata
- operator-only `recommendation policy prune` mutation for archived and superseded governance-history rows
- cross-horizon `recommendation policy` reporting for active backlog, recent exits, policy history, and retention candidates
- compact planning-policy governance counts in `status`
- item-based planning-policy governance and retention pressure in `worklist`
- no schema change beyond Phase 17 and no ranking-version change beyond `phase12-v1`

Phase 19 adds:

- derived-only grouped policy-history summaries in operator-only `recommendation policy`
- grouped-family counts for repeated governance cycles and mixed archive/supersede outcomes
- a governance-hygiene watchlist that highlights policy churn and prune-ready history families
- `policy_history_recent_events` as the clearer raw-governance drill-down field while keeping `policy_history` as a temporary compatibility alias
- no schema change beyond Phase 17, no ranking-version change beyond `phase12-v1`, and no new mutation surface

Phase 20 adds:

- explicit assistant-safe audit categories for the existing safe event families without widening assistant-visible audit scope
- normalized assistant-safe audit summaries and sanitized metadata through a shared policy registry
- `recommendation policy` primary-attention fields: `policy_attention_kind`, `policy_attention_summary`, and `policy_attention_command`
- simplified compact policy attention in `status` and one-at-a-time policy item pressure in `worklist`
- `policy_history` retained as a deprecated compatibility alias for one more phase while `policy_history_recent_events` stays preferred

Phase 21 adds:

- removal of the deprecated operator-only `policy_history` alias from the policy-report contract
- `policy_history_recent_events` as the only raw-governance drill-down field
- no change to assistant-safe audit scope, no schema change beyond Phase 17, and no ranking-version change beyond `phase12-v1`

Phase 22 adds:

- removal of the last deprecated compact policy status fields: `top_policy_recent_exit_summary` and `top_policy_retention_candidate_summary`
- `status` keeping only the primary compact policy attention fields while `recommendation policy` remains the detailed governance surface
- no change to assistant-safe audit scope, categories, or filtering

Phase 23 adds:

- internal consolidation so `recommendation policy`, `status`, and `worklist` derive primary policy attention from the same decision path
- no public contract removals, no schema change beyond Phase 17, and no ranking-version change beyond `phase12-v1`
- a clearer supported baseline for governance surfaces instead of another compatibility-cleanup step

Phase 24 adds:

- no public contract changes while keeping `policy_recent_exit_count` and `policy_retention_candidate_count` in the status JSON
- quieter human-readable `status` output that keeps one primary `Policy attention` line and moves compact policy counts into lower-priority context
- a stronger supported-surface explanation for `recommendation policy`, `status`, `worklist`, assistant-safe audit, hygiene, and tuning

Phase 25 adds:

- removal of `policy_recent_exit_count` and `policy_retention_candidate_count` from the status JSON so compact governance signaling now centers only on `policy_attention_kind` and `top_policy_attention_summary`
- no change to `recommendation policy`, which remains the operator-only detailed governance surface for recent exits, retention candidates, grouped history, and raw governance drill-down
- no change to assistant-safe audit scope, categories, or filtering

Phase 26 adds:

- no public contract changes while treating the post-Phase-25 governance surface as the supported baseline
- stronger proof that `recommendation policy`, `status`, and `worklist` stay aligned on one policy-attention choice
- a clearer long-term surface map for operator governance, compact status, worklist attention, assistant-safe audit, hygiene, and tuning
- explicit confirmation that assistant-safe audit remains a fixed categorized feed by design rather than a temporary compromise

Phase 27 adds:

- no public contract changes while simplifying the human-readable `recommendation policy` output
- less repetitive operator-facing governance wording while keeping the same detailed sections and section order
- clearer documentation that `recommendation policy` is the detailed surface, `status` is the compact surface, and `worklist` is the next-attention surface
- no change to assistant-safe audit scope, categories, or filtering

Phase 28 adds:

- no public contract changes while reviewing the live post-Phase-27 governance surfaces as the supported baseline
- a small evidence-backed policy formatter cleanup that trims repeated summary labels without changing section order or data shape
- refreshed documentation of what evidence was reviewed and why the current governance surface remains the supported model
- no change to assistant-safe audit scope, categories, or filtering

Phase 29 adds:

- no public contract changes while keeping the post-Phase-28 governance surface as the supported baseline
- suppression of empty cue rows in human-readable `recommendation policy` so operators only see meaningful cue lines
- unchanged `status`, `worklist`, and assistant-safe audit behavior while the detailed policy view becomes quieter to scan
- refreshed documentation and full re-verification after the formatter-only cleanup

Phase 30 adds:

- no public contract changes while treating the post-Phase-29 governance surface as the steady-state supported baseline
- a live stability review across `recommendation policy`, `status`, `worklist`, and assistant-safe audit that confirms no further readability fix is currently needed
- refreshed documentation and full re-verification showing the current human-readable governance view is quiet enough for steady-state use

Phase 31 adds:

- no public contract changes while keeping the post-Phase-30 governance surface as the supported baseline
- an additive optional `category` filter on assistant-safe and operator audit reads using the existing categories: `sync`, `task`, `task_suggestion`, and `planning`
- unchanged default assistant-safe audit behavior when no filter is supplied, plus unchanged raw operator audit behavior
- refreshed documentation and full re-verification after the audit ergonomics patch

Phase 32 adds:

- no public contract changes while reviewing the live post-Phase-31 audit model across CLI, HTTP, and MCP read surfaces
- explicit supported usage examples for default and filtered audit reads
- documentation confirmation that the current single-category audit filter is sufficient in real usage and that no broader query surface is currently justified

Phase 33 adds:

- no public contract changes while re-validating the live post-Phase-32 audit model at both short and wider slices across HTTP and MCP
- documentation confirmation that the current default-plus-single-category audit model remains sufficient and that any remaining desire for broader audit queries is convenience, not a defect
- refreshed examples showing both quick recent-activity review and wider filtered review on the supported audit surfaces
- post-program audit follow-up now enforces that supported contract in the live HTTP and MCP surfaces, so unsupported audit query params are rejected instead of remaining silently available

Supported governance surface map:

- `recommendation policy`: detailed operator-only governance surface
- `status`: compact health and primary attention surface
- `worklist`: single-item attention prompt, not a dashboard
- assistant-safe audit: categorized feed for safe operational context with an optional single-category filter on the existing safe categories
- hygiene and tuning: assistant-safe explanatory planning reads, not policy-governance control surfaces

Unsupported audit query params are rejected. The supported audit read inputs are:

- HTTP: `limit` and optional `category`
- MCP `audit_events_recent`: `limit` and optional `category`

Supported audit read examples:

- HTTP default recent activity:
  - `curl -H "Authorization: Bearer <assistant-token>" "http://127.0.0.1:46210/v1/audit/events?limit=5"`
- HTTP wider recent-activity review:
  - `curl -H "Authorization: Bearer <assistant-token>" "http://127.0.0.1:46210/v1/audit/events?limit=20"`
- HTTP focused planning context:
  - `curl -H "Authorization: Bearer <assistant-token>" "http://127.0.0.1:46210/v1/audit/events?limit=20&category=planning"`
- HTTP focused task context:
  - `curl -H "Authorization: Bearer <assistant-token>" "http://127.0.0.1:46210/v1/audit/events?limit=20&category=task"`
- HTTP focused task-suggestion context:
  - `curl -H "Authorization: Bearer <assistant-token>" "http://127.0.0.1:46210/v1/audit/events?limit=20&category=task_suggestion"`
- MCP default recent activity:
  - `audit_events_recent(limit=5)`
- MCP wider recent-activity review:
  - `audit_events_recent(limit=20)`
- MCP focused planning context:
  - `audit_events_recent(limit=20, category="planning")`
- MCP focused task context:
  - `audit_events_recent(limit=20, category="task")`
- MCP focused task-suggestion context:
  - `audit_events_recent(limit=20, category="task_suggestion")`

Filtering narrows already-visible events only. It does not widen the safe event set and it does not change assistant-safe shaping or operator raw audit behavior.

Required manual credential step:

1. Create a Google Cloud project for the dedicated Gmail account.
2. Enable the Gmail API.
3. Create a Desktop OAuth client.
4. Put the mailbox address in `~/.config/personal-ops/config.toml`.
5. Place the OAuth client JSON in `~/.config/personal-ops/gmail-oauth-client.json`.
6. Re-run `personal-ops auth google login` after Phase 7 rollout so the dedicated account grants the shared Gmail, Calendar read, and owned-event write scopes.

Useful commands:

- `personal-ops auth gmail login`
- `personal-ops auth google login`
- `personal-ops calendar status`
- `personal-ops calendar sync now`
- `personal-ops calendar calendars`
- `personal-ops calendar owned`
- `personal-ops calendar upcoming`
- `personal-ops calendar conflicts`
- `personal-ops calendar free-time --day YYYY-MM-DD`
- `personal-ops calendar day YYYY-MM-DD`
- `personal-ops calendar event <event-id>`
- `personal-ops calendar create --title "..." --start-at "..." --end-at "..."`
- `personal-ops calendar update <event-id> [--title "..."] [--start-at "..."] [--end-at "..."]`
- `personal-ops calendar cancel <event-id> --note "..."`
- `personal-ops calendar schedule-task <task-id> --start-at "..." --end-at "..."`
- `personal-ops calendar unschedule-task <task-id> --note "..."`
- `personal-ops status`
- `personal-ops worklist`
- `personal-ops doctor`
- `personal-ops doctor --deep`
- `personal-ops inbox status`
- `personal-ops inbox sync now`
- `personal-ops inbox unread`
- `personal-ops inbox thread <thread-id>`
- `personal-ops inbox followups`
- `personal-ops inbox needs-reply`
- `personal-ops inbox recent`
- `personal-ops mail draft list`
- `personal-ops task list`
- `personal-ops task list --all`
- `personal-ops task show <task-id>`
- `personal-ops task create --title "..." [--notes "..."] [--due-at "..."] [--remind-at "..."]`
- `personal-ops task update <task-id> [--title "..."] [--notes "..."]`
- `personal-ops task start <task-id>`
- `personal-ops task complete <task-id> --note "..."`
- `personal-ops task cancel <task-id> --note "..."`
- `personal-ops task snooze <task-id> --until "..." --note "..."`
- `personal-ops task due`
- `personal-ops task overdue`
- `personal-ops task prune --older-than-days 30`
- `personal-ops suggestion list`
- `personal-ops suggestion list --all`
- `personal-ops suggestion show <suggestion-id>`
- `personal-ops suggestion accept <suggestion-id> --note "..."`
- `personal-ops suggestion reject <suggestion-id> --note "..."`
- `personal-ops suggestion prune --older-than-days 30`
- `personal-ops recommendation list`
- `personal-ops recommendation list --grouped`
- `personal-ops recommendation next`
- `personal-ops recommendation next --group <group-key>`
- `personal-ops recommendation summary`
- `personal-ops recommendation tuning`
- `personal-ops recommendation policy`
- `personal-ops recommendation policy --json`
- `personal-ops recommendation backlog`
- `personal-ops recommendation backlog --group <group-key>`
- `personal-ops recommendation backlog --group <group-key> --source system_generated`
- `personal-ops recommendation backlog --kind schedule_thread_followup --stale-only`
- `personal-ops recommendation backlog --manual-only`
- `personal-ops recommendation backlog --resurfaced-only`
- `personal-ops recommendation closure`
- `personal-ops recommendation closure --days 7`
- `personal-ops recommendation closure --days 30 --source system_generated`
- `personal-ops recommendation closure --days 30 --close-reason rejected_handled_elsewhere`
- `personal-ops recommendation hygiene`
- `personal-ops recommendation hygiene --candidate-only`
- `personal-ops recommendation hygiene --review-needed-only`
- `personal-ops recommendation hygiene --group urgent_unscheduled_tasks`
- `personal-ops recommendation hygiene review --group <group-key> --kind <kind> --source <source> --decision <decision> [--note "..."]`
- `personal-ops recommendation hygiene proposal record --group <group-key> --kind <kind> --source <source> [--note "..."]`
- `personal-ops recommendation hygiene proposal dismiss --group <group-key> --kind <kind> --source <source> [--note "..."]`
- `personal-ops recommendation policy archive --group <group-key> --kind <kind> --source <source> [--note "..."]`
- `personal-ops recommendation policy supersede --group <group-key> --kind <kind> --source <source> --note "..."`
- `personal-ops recommendation policy prune --older-than-days 90 --event-type archived --dry-run`
- `personal-ops recommendation policy prune --older-than-days 30 --event-type superseded`
- `personal-ops audit tail --limit 20`
- `personal-ops recommendation show <recommendation-id>`
- `personal-ops recommendation group show <group-key>`
- `personal-ops recommendation group snooze <group-key> --preset tomorrow-morning --note "..."`
- `personal-ops recommendation group reject <group-key> --reason duplicate --note "..."`
- `personal-ops recommendation apply <recommendation-id> --note "..."`
- `personal-ops recommendation reject <recommendation-id> --reason handled_elsewhere --note "..."`
- `personal-ops recommendation snooze <recommendation-id> --until "..." --note "..."`
- `personal-ops recommendation snooze <recommendation-id> --preset tomorrow-morning --note "..."`
- `personal-ops recommendation replan <recommendation-id> --note "..."`
- `personal-ops recommendation refresh`
- `personal-ops mail draft request-approval <artifact-id>`
- `personal-ops review list`
- `personal-ops review pending`
- `personal-ops review show <review-id>`
- `personal-ops review open <review-id>`
- `personal-ops review resolve <review-id> --note "..."`
- `personal-ops approval list`
- `personal-ops approval pending`
- `personal-ops approval show <approval-id>`
- `personal-ops approval request <artifact-id>`
- `personal-ops approval approve <approval-id> --note "..."` 
- `personal-ops approval reject <approval-id> --note "..."` 
- `personal-ops approval send <approval-id> --note "..."` 
- `personal-ops approval reopen <approval-id> --note "..."` 
- `personal-ops approval cancel <approval-id> --note "..."` 
- `personal-ops approval confirm <approval-id> --action approve`
- `personal-ops approval confirm <approval-id> --action send`
- `personal-ops send-window status`
- `personal-ops send-window enable --minutes 15 --reason "..."`
- `personal-ops send-window disable --reason "..."`
- `personal-ops audit tail`
- `personal-ops backup create`
- `personal-ops backup list`
- `personal-ops backup inspect <snapshot-id>`

Dark-launch note:

- Phase 2 ships with sending disabled by default through `allow_send = false`.
- Keep it disabled until you complete a supervised live test.
- Approval and send are separate actions.
- MCP approve/send requires a short-lived confirmation token issued from the operator channel first.
- Phase 2.5 introduces timed send windows as the recommended way to allow supervised live sends temporarily.
- Phase 3 keeps inbox access metadata-only. No message bodies or attachments are indexed locally.
- Phase 5 keeps tasks internal-only. There is no recurrence and no Apple or Google task provider sync yet.
- Phase 5 polish keeps default task and suggestion lists focused on active items; use `--all` when you want history.
- Phase 6 keeps calendar read-only before Phase 7 rollout.
- Phase 7 keeps calendar mutation operator-only. No assistant-side event creation, no guest invites, no Meet links, no recurrence, and no focus-time/out-of-office/working-location writes are included.
- Phase 8 keeps planning recommendation apply/reject/snooze operator-only. Assistants may read planning recommendations and create task-block recommendations, but they still do not write calendar events directly.
- Phase 9 keeps planning recommendation replan operator-only, keeps grouped planning reads non-mutating, and adds schema compatibility preflight before the daemon finishes booting.
- Phase 10 keeps planning recommendation apply and replan single-item only. Grouped planning mutations stay operator-only and are limited to low-risk `snooze` and `reject`. Assistants may read group detail and next-action views, but they still do not mutate groups or write calendar events directly.
- Phase 11 keeps planning summary, backlog, and closure analytics derived and non-mutating. Assistants may read those reports, but they still do not apply, reject, snooze, replan, mutate groups, or write calendar events directly.
- Phase 12 keeps schema `12` and remains derived/read-first. Active and historical totals are now separated in `status`, filtered analytics stay non-mutating, and ranking calibration changes ordering only for system-generated recommendations. Assistants still do not apply, reject, snooze, replan, mutate groups, or write calendar events directly.
- Phase 13 stays on schema `12` and remains advisory-only. Hygiene reports, queue-share summaries, and suppression candidates are derived reads only. No suppression rule state, no automatic hiding, and no new mutation surface were introduced. Assistants still do not apply, reject, snooze, replan, mutate groups, or write calendar events directly.
- Phase 14 stays on schema `12`. Hygiene review is operator-only and audit-derived. `review_needed_only` is a read filter only. No suppression rule state, no automatic hiding, and no ranking-version change were introduced. Assistants still do not apply, reject, snooze, replan, mutate groups, review hygiene families, or write calendar events directly.
- Phase 17 keeps ranking at `phase12-v1` and moves schema to `14`. Hygiene policy proposals remain explicit, operator-only, and non-enforcing. Policy governance history is now explicit and operator-only, assistant-safe hygiene now also redacts review attribution and review note, assistant-safe recommendation detail now strips planning-policy audit history, and no automatic suppression, hiding, lifecycle mutation, or new assistant mutation surface was introduced.
- Phase 18 keeps schema `14` and ranking `phase12-v1`. Assistant-safe audit reads are now least-privilege and omit sensitive/operator-only actions by default, policy-history retention is now explicit and operator-controlled through `recommendation policy prune`, and policy-governance summaries now connect active backlog, recent exits, long-horizon history, and retention candidates without adding automatic suppression, hiding, lifecycle mutation, or new assistant mutation.
- Phase 19 keeps schema `14` and ranking `phase12-v1`. Policy-history compression is derived only, raw governance events remain the source of truth, grouped policy-history families stay operator-only, assistant-safe audit scope remains unchanged from Phase 18, and no automatic suppression, hiding, lifecycle mutation, or new assistant mutation surface was introduced.
- Phase 20 keeps assistant-safe audit fixed and categorized, keeps `recommendation policy` as the primary detailed governance surface, and simplifies compact policy attention in `status` and `worklist` without widening assistant reach.
- Phase 21 removes only the deprecated operator-only `policy_history` alias and keeps `policy_history_recent_events` as the sole raw-governance drill-down field.
- Phase 22 removes the last deprecated compact policy status summary fields and keeps `policy_attention_kind` plus `top_policy_attention_summary` as the primary compact policy signals.
- Phase 23 keeps the public governance surface stable and consolidates the internal policy-attention derivation so `recommendation policy`, `status`, and `worklist` stay aligned without changing trust boundaries.
- Phase 24 keeps the compact policy counts as lower-priority context in human-readable `status` while leaving the machine-readable contract unchanged.
- Phase 25 removes the remaining compact policy counts from `status`, leaving `policy_attention_kind` and `top_policy_attention_summary` as the only compact governance fields while `recommendation policy` remains the detailed operator surface.
- Phase 26 keeps that post-Phase-25 model unchanged and confirms it as the supported long-term baseline through stronger consistency coverage and clearer system documentation.
- Phase 27 keeps that supported baseline unchanged while simplifying human-readable policy reporting and strengthening the shared surface map in the docs.
- Phase 28 keeps that supported baseline unchanged while reviewing live evidence across `recommendation policy`, `status`, `worklist`, and assistant-safe audit, then makes one small formatter cleanup to reduce lingering repetition.
- Phase 29 keeps that supported baseline unchanged while suppressing empty cue rows in human-readable `recommendation policy`, so the detailed operator view stays quieter without changing contracts, trust boundaries, or assistant-safe audit behavior.
- Phase 30 keeps that supported baseline unchanged and confirms through fresh live review that no further code change is currently justified, so the governance surface can be treated as the steady-state model until later evidence says otherwise.
- Phase 31 keeps that supported baseline unchanged while adding one narrow audit ergonomics improvement: assistants and operators can now filter existing audit reads by `sync`, `task`, `task_suggestion`, or `planning` without widening visibility or changing the default feed.
- Phase 32 keeps that supported baseline unchanged while confirming through fresh live review that the current default-plus-single-category audit model is sufficient in practice across both HTTP and MCP reads.
- Phase 33 keeps that supported baseline unchanged while re-validating the current audit model at both quick and wider slices, confirming that it remains sufficient and that no broader query surface is justified right now.

Recovery runbook:

1. Stop the daemon:
   - `launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/com.d.personal-ops.plist"`
2. Preserve the current state directory before changing anything:
   - copy `~/Library/Application Support/personal-ops/` somewhere safe
3. Replace the database and config files manually from the selected snapshot under:
   - `~/Library/Application Support/personal-ops/snapshots/<snapshot-id>/`
4. Restart the daemon:
   - `launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.d.personal-ops.plist"`
5. Verify the restored state:
   - `personal-ops doctor --deep`
