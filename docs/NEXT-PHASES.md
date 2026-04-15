# personal-ops Next Phases

> Covers Tier 2 through Tier 6 of the machine-intelligence hub roadmap.
> Foundation (F1–F6) and Tier 1 (1.1–1.5) are complete.

---

## Tier 2 — Personal Intelligence Stack

The goal: make the system know you — your relationships, your context history, and
your email as a searchable knowledge base. These are the highest-leverage features
because they make every other tier's output smarter.

### 2.1 — Relationship Graph

**What it does:** Builds a contact graph from email and calendar history. Tracks
interaction frequency, last contact, relationship warmth, and open threads per
person.

**Implementation:**
- `app/src/relationship-graph.ts` — compute `ContactNode` from mail_messages +
  calendar_events (attendees_json)
- DB: new table `contacts` (email, display_name, first_seen, last_contact,
  interaction_count, open_thread_count)
- `db.ts`: `upsertContact()`, `getContactGraph()`, `getContactDetail(email)`
- MCP tool: `contact_graph` — returns top contacts by recency/frequency
- HTTP: `GET /v1/contacts` + `GET /v1/contacts/:email`
- CLI: `personal-ops contacts` + `personal-ops contacts show <email>`
- Rebuild incrementally on each inbox sync (delta, not full rescan)

**Tests:** contact graph builds from mail fixture, warmth scoring, open thread count.

---

### 2.2 — AI Session Memory (Cross-Project Context)

**What it does:** Surfaces what Claude has been working on across all projects.
Reads bridge-db session log and produces a searchable, categorized memory of
recent AI work.

**Implementation:**
- `app/src/ai-memory.ts` — reads `bridge-db` sessions, extracts project names,
  action summaries, and timestamps
- MCP tool: `ai_context_recall` — given a topic/project name, returns relevant
  recent AI sessions
- HTTP: `GET /v1/ai/memory?q=<query>&project=<name>`
- Morning briefing integration: add "AI context yesterday" section

**Tests:** session parsing, topic query filter, project filter.

---

### 2.3 — Email Knowledge Base

**What it does:** Full-text search over email threads. Answers "what did we decide
about X?" and "what's the thread history with person Y about Z?"

**Implementation:**
- `db.ts`: enable SQLite FTS5 on mail_messages (subject + snippet)
  — migration V30: `CREATE VIRTUAL TABLE mail_fts USING fts5(...)`
- `app/src/email-kb.ts` — `searchMailKnowledgeBase(query, limit)`, returns
  thread summaries with relevance rank
- MCP tool: `email_search` — full-text query over inbox
- HTTP: `GET /v1/inbox/search?q=<query>&limit=<n>`
- CLI: `personal-ops inbox search "<query>"`

**Tests:** FTS5 search returns ranked results, empty query guard, special char escape.

---

### 2.4 — Follow-Up Automation

**What it does:** Generates draft follow-up emails for stale threads. Uses Ollama
(already installed) to draft polite nudges for threads where you sent last and
got no reply in N days.

**Implementation:**
- `app/src/followup-drafter.ts` — takes stale_followup threads, calls Ollama
  `qwen2.5-coder:14b` to draft a short nudge
- Draft goes to `mail_drafts` table via existing `createMailDraft()`
- MCP tool: `draft_followup` — drafts follow-up for a given thread_id
- HTTP: `POST /v1/drafts/followup { thread_id }`
- CLI: `personal-ops draft followup <thread-id>`
- Approval gate: draft must be approved before sending

**Tests:** draft creates correct structure, approval gate enforced, Ollama fallback
when service unavailable.

---

## Tier 3 — Portfolio & Career Intelligence

### 3.1 — GitHub Portfolio Pulse

**What it does:** Pulls GithubRepoAuditor JSON output into personal-ops and
produces a portfolio health narrative, surfacing repos needing attention.

**Implementation:**
- `app/src/portfolio-reader.ts` — already exists (F4), extend to read
  `~/Projects/GithubRepoAuditor/output/*.json` for per-repo risk data
- New: `getPortfolioNarrative()` — generates prose from risk scores
- Morning briefing integration: add "Portfolio alerts" section when high-risk
  repos exist
- MCP tool: `portfolio_alerts` — returns repos with risk > threshold
- Daemon: daily 9am portfolio check, hub notification if critical

**Tests:** risk threshold filter, narrative format, empty portfolio guard.

---

### 3.2 — Commit Stream Dashboard

**What it does:** Aggregates today's commits across all ~/Projects repos into a
unified commit stream. Surfaces in the console "Shipped Today" tab.

**Implementation:**
- Console section "shipped" — new `SectionId`
- HTTP: `GET /v1/portfolio/commits?since=<iso>` — calls `scanGitCommitsToday()`
  (already in service.ts from Tier 1.4) with richer output
- Extend to include: diff stat, commit hash, branch name
- Console: new nav item "Shipped" renders commit stream grouped by repo

**Tests:** git scan returns correct structure, empty projects dir guard.

---

### 3.3 — Career Context Snapshot

**What it does:** Pulls career-relevant signals (speaking invites, job applications,
notable projects, AI session output) into a weekly career digest.

**Implementation:**
- `app/src/career-snapshot.ts` — reads bridge-db (AI session topics), mail
  (sender domain heuristics for recruiter/conference mail), and git commits
- `GET /v1/career/snapshot` — weekly summary
- MCP tool: `career_snapshot`
- CLI: `personal-ops workflow career-snapshot`
- Archive: appends to `~/Notes/personal-ops/career/YYYY-WW.md`

---

## Tier 4 — Agent Crew

### 4.1 — Inbox Autopilot (Enhanced)

**What it does:** Extends existing inbox autopilot to draft replies for
`act_today` threads using Ollama. Requires approval before any send.

**Implementation:**
- `app/src/inbox-autopilot.ts` — extend `InboxAutopilotService` to call Ollama
  for draft generation when bucket = `act_today`
- Draft pipeline: classify → draft → approval gate → send
- Configurable: `autopilot.inbox.draft_enabled: true` in config
- Console: Inbox autopilot section shows draft queue

---

### 4.2 — Planning Autopilot (Enhanced)

**What it does:** Connects GithubRepoAuditor risk output to planning
recommendations. High-risk repos automatically surface as planning items.

**Implementation:**
- `app/src/planning-autopilot.ts` — extend to read portfolio risk data, generate
  `PlanningRecommendation` records for repos with risk > 0.7
- New recommendation kind: `portfolio_risk`
- Console: planning section shows portfolio-sourced recommendations

---

### 4.3 — Eval-Driven Prompt Tuning

**What it does:** Reads eval results from `~/Projects/evals/results/index.jsonl`
and suggests prompt improvements when agent performance drops below threshold.

**Implementation:**
- `app/src/eval-monitor.ts` — watches evals results, computes rolling pass rate
- Daemon: check evals every 6h, hub notification when pass rate drops > 10%
- MCP tool: `eval_alert` — returns underperforming evals with suggested fixes
- HTTP: `GET /v1/evals/alerts`

---

## Tier 5 — Ambient Layer

### 5.1 — GlassLayer Deep Integration

**What it does:** GlassLayer panels show live personal-ops data. Currently only
inbox/calendar/approvals push every 5m. Extend to push richer context.

**New panels:**
- `portfolio_risk` — top 3 risky repos
- `ai_activity` — today's AI cost + active sessions
- `followup_pressure` — stale thread count

**Implementation:**
- `daemon.ts`: add panel push calls alongside existing pushes
- GlassLayer panel configs: update panel layout in GlassLayer project

---

### 5.2 — Raycast Extension

**What it does:** Raycast extension that exposes personal-ops commands natively
via Raycast's quick-action UI. Replaces the web console Cmd-K palette for
day-to-day use.

**Commands:**
- Morning briefing (read-only view)
- End-of-day digest
- Meeting contact brief
- Approve pending draft
- Search email KB

**Implementation:**
- `extensions/raycast/` — Raycast extension (TypeScript, React)
- Calls personal-ops HTTP API at 127.0.0.1:46210
- Auth: session token from `personal-ops console --token`

---

## Tier 6 — Unification & Optimization

### 6.1 — DuckDB Analytics Layer

**What it does:** Exposes personal-ops SQLite data via DuckDB for ad-hoc analytics
and cross-database queries (bridge-db + personal-ops + GithubRepoAuditor).

**Implementation:**
- `app/src/analytics.ts` — DuckDB WASM or native bridge
- `GET /v1/analytics/query` — safe read-only SQL subset
- Console: "Analytics" section with pre-built queries

---

### 6.2 — Fine-Tuning Data Pipeline

**What it does:** Packages high-quality AI session transcripts from bridge-db as
fine-tuning data for Claude. Outputs JSONL in Anthropic fine-tune format.

**Implementation:**
- `app/src/finetune-exporter.ts`
- CLI: `personal-ops export finetune --since <date> --out <path>`
- Filters: removes sessions with < 3 turns, deduplicates by topic

---

### 6.3 — Cross-Machine State Sync

**What it does:** Syncs personal-ops state (inbox, calendar, tasks) across
machines via an encrypted remote snapshot stored in a private S3 bucket or iCloud.

**Implementation:**
- `app/src/sync.ts` — encrypt/decrypt snapshot with machine key
- CLI: `personal-ops sync push` + `personal-ops sync pull`
- Approval gate: pull requires operator confirmation before overwrite
- Daemon: auto-push on each successful snapshot

---

## Implementation Order

```
Tier 2.1  Relationship Graph         (highest leverage — feeds briefs + autopilot)
Tier 2.3  Email Knowledge Base       (FTS5, enables search across all tiers)
Tier 3.1  Portfolio Pulse            (GithubRepoAuditor already running)
Tier 2.2  AI Session Memory          (bridge-db already reading)
Tier 4.1  Inbox Autopilot Enhanced   (Ollama already configured)
Tier 3.2  Commit Stream Dashboard    (scanGitCommitsToday already exists)
Tier 2.4  Follow-Up Automation       (depends on 2.3 for context)
Tier 3.3  Career Context Snapshot    (depends on 2.2, 3.1)
Tier 4.2  Planning Autopilot Enh.    (depends on 3.1)
Tier 4.3  Eval-Driven Tuning         (evals-reader already exists)
Tier 5.1  GlassLayer Deep Integ.     (daemon already pushes, extend panels)
Tier 5.2  Raycast Extension          (depends on HTTP API being stable)
Tier 6.1  DuckDB Analytics           (depends on stable schema)
Tier 6.2  Fine-Tuning Pipeline       (depends on bridge-db maturity)
Tier 6.3  Cross-Machine Sync         (last — most risky, least urgent)
```

---

## Architecture Notes

- Every new service follows the pattern: `service.ts` method → HTTP route → MCP
  tool → CLI command → test coverage → formatter in `formatters/workflows.ts`
- DB migrations use `addColumnIfMissing()` + numbered `migrateToV*()`. Bump
  `CURRENT_SCHEMA_VERSION` in `db.ts`.
- Ollama calls are always gated: check `config.ollamaEnabled` before calling.
  Never block sync paths on Ollama — always fallback gracefully.
- Daemon intervals: 60s for pre-meeting checks, 5m for GlassLayer pushes, 1h for
  portfolio scans, 6h for eval checks.
- All new features add at least 4 tests: MCP wired, HTTP route wired, service
  method wired, formatter renders output.
