# personal-ops Vision Roadmap
# Generated: 2026-04-14
# Source: Deep machine audit + comprehensive web research session

## Quick Reference
- Foundation Layer: F1-F6 (wire existing projects, no new features)
- Tier 1: Daily Habit Engine (morning briefing, email triage, command palette)
- Tier 2: Personal Intelligence Stack (relationship graph, AI memory, email KB)
- Tier 3: Portfolio & Career Intelligence (App Store, drift detection, job pipeline)
- Tier 4: Agent Crew (triage, context, portfolio, release agents)
- Tier 5: Ambient & Agentic Layer (flow state, GlassLayer intelligence, calendar data)
- Tier 6: Far Horizon (DuckDB unification, fine-tuning, Raycast, voice capture)

## Sequencing
- NOW: Merge v0.2.0 release branch, then F1+F2+F3 (1-2 days each)
- WEEKS 1-2: All of Tier 1 (habit formation layer — nothing else matters without daily use)
- WEEKS 3-6: F4+F5+F6, then Tier 2 priority items
- MONTHS 2-3: Tier 3 + Tier 4
- MONTHS 4+: Tier 5 + Tier 6

---

## FOUNDATION LAYER — Wire What Already Exists

### F1. notification-hub as the Universal Event Bus
- Port: 127.0.0.1:9199
- API: POST /events (source, level, title, body, project, timestamp), GET /health
- Log: ~/.local/share/notification-hub/events.jsonl
- What to wire FROM personal-ops: inbox autopilot completion, approval ready, GitHub review aging past 24h, doctor drift findings, outbound pipeline state changes
- What to READ into personal-ops: the JSONL as a unified activity feed in the console
- Also wire: APIReverse, ArguMap, Codec, ConvictionMapper, LifeCadenceLedger, NetMapper, RedditSentimentAnalyzer, SpecCompanion, ApplyKit, DecisionStressTest — all should POST completion/alert events here
- This becomes the machine's nervous system. Every project speaks to it; personal-ops reads it.

### F2. GlassLayer Ambient Status Feed
- Port: 127.0.0.1:9876
- API: POST /hook/{panel_id} — pushes arbitrary text lines into a named always-on-top panel
- What personal-ops posts every 5 min: inbox urgent count, next calendar event, overdue task count, top drifting repo, active approval count
- Format: compact single line, e.g. "inbox:3 | next:standup@2pm | tasks:2 overdue | drift:NetworkDecoder"
- GlassLayer is always visible above all windows. Zero app-switch friction for ambient awareness.
- Extended: flow state detection (Tier 5) drives overlay density — shrink during focus, expand during planning mode

### F3. bridge-db Daily AI Cost + Activity Feed
- DB: ~/.local/share/bridge-db/bridge.db (WAL-mode SQLite)
- Tables: activity_log (session, action, project, timestamp), cost_records (session, cost_usd, tokens, model), handoffs (from_agent, to_agent, context, status)
- MCP tools available: log_activity, create_handoff, record_cost, save_snapshot, export_bridge_markdown
- What personal-ops pulls nightly: yesterday's total cost, session count, task completions, pending handoffs
- Morning briefing block: "AI yesterday: 4 sessions · $6.80 · 1 handoff pending"
- This makes daily AI spend visible — changes allocation behavior immediately

### F4. GithubRepoAuditor Portfolio Feed
- Output path: ~/Projects/GithubRepoAuditor/output/ (JSON, Markdown, HTML, XLSX, SQLite)
- Key files: portfolio_snapshot.json (latest audit), weekly_digest.json (machine-consumable)
- New MCP tool: portfolio_health — reads latest output, returns top 3 repos by grade drop, top 3 by stale activity, open critical issues
- Surfaces in: morning briefing (one line), worklist (expandable), GlassLayer panel
- Note: GithubRepoAuditor schema is now at 0.4.0, 799 tests, risk overlay shipped (Phases 103-108 complete)
- Also has Notion sync (notion_sync.py, notion_client.py, notion_dashboard.py) — can be wired to push portfolio status to Notion workspace

### F5. MCPAudit Security Posture Tile
- CLI: mcp-audit scan --json (scores 0-10 per MCP server by permission surface)
- Also detects: prompt injection patterns, schema drift vs saved baseline
- Watch mode: re-scans on config changes
- Integration: schedule weekly scan via launchd, POST risk-score increases or new servers to notification-hub as urgent events
- Add to personal-ops doctor output: new "security posture" section
- Alert threshold: any server risk score increase of 2+ points, or any new server appearing

### F6. Evals Agent Performance Ledger
- JSONL: ~/Projects/evals/results/index.jsonl
- Fields per run: pass (bool), cost_usd, tokens, wall_time_seconds, model_name, lines_changed, task_category
- 43 cases across 8 categories: Claude Code vs Codex vs local Ollama
- New MCP tool: agent_performance_summary — which agent wins on which task class at what cost
- Feed into model routing decisions (see Tier 4.5)
- Also feeds: weekly retro digest (how much did AI work cost this week, which agent was most efficient)

---

## TIER 1 — Daily Habit Engine

### 1.1 Shell-Triggered Morning Briefing
- Trigger: .zshrc hook on first new terminal session of the day (not a cron — fires when you actually start working)
- Command: personal-ops workflow morning
- Target: prints in under 3 seconds, no browser required
- Five sections:
  1. Calendar shape: today's events list, first meeting time, any detected conflicts
  2. Inbox bucket 1: up to 3 threads classified "act today", each with one action (reply/snooze/ignore)
  3. Overdue tasks: max 3, each with one action (complete/snooze/cancel)
  4. Portfolio pulse: top drifting repo from GithubRepoAuditor output (one line)
  5. AI cost yesterday: from bridge-db (one line: "4 sessions · $6.80 · 1 handoff pending")
  6. Alerts: any urgent MCPAudit finding, doctor drift, or notification-hub urgent event from overnight
- Writing: each briefing appends to ~/Notes/personal-ops/YYYY-MM-DD.md (Obsidian-compatible archive)
- Research basis: tools anchored to first-session trigger have 64% higher retention than fixed-cron tools

### 1.2 Email 4-Bucket Auto-Classification
- On every inbox sync, classify each thread into:
  - act_today: needs a decision or reply within 24h
  - waiting_on_someone: you sent last, awaiting response — auto-resurface when related calendar event approaches or PR changes
  - read_when_relevant: FYI / async / newsletter — disappears from console view
  - archive: no action needed
- Console view: shows ONLY act_today and waiting_on_someone (capped at 5 each)
- Calibration: "act_today" threshold learned from your actual reply patterns over rolling 30 days (which threads you replied to within 24h)
- Implementation: local Ollama classification on thread subject + sender + first 200 chars. No cloud API needed for this task.
- Basis: Shortwave reports 45% faster inbox-zero with binary "needs reply / no action" framing

### 1.3 Pre-Meeting Contact Brief
- Trigger: 30 minutes before any calendar event with external attendees
- Source: Gmail metadata + Calendar history (no new data source needed)
- Output per attendee: last contact date, who initiated last, open thread count, meeting count together, topic of last interaction
- Delivery: notification-hub macOS notification with expandable detail
- Implementation: Gmail API thread search by participant email, Calendar API attendee history — pure metadata, no content read
- Extends into: full relationship graph (Tier 2.1) once that's built

### 1.4 End-of-Day Digest
- Trigger: configurable time (default 5pm) via launchd, or manual personal-ops workflow end-of-day
- Three sections:
  1. Shipped: git commits across ~/Projects/ today (grouped by repo, one line each)
  2. Dropped: tasks that were open this morning but not completed (moved to tomorrow queue)
  3. Follow-up needed: inbox threads read but not replied to (older than 4 hours, not in waiting_on_someone)
- Writes to: ~/Notes/personal-ops/YYYY-MM-DD.md (same daily file as morning briefing, appended)
- After 90 days: Ollama can answer "what did I work on the week I shipped GhostRoutes?" from the archive

### 1.5 Command Palette as Primary Interface
- Trigger: Cmd-K from anywhere in the web console
- Covers: every MCP tool action, every workflow command, every autopilot surface
- Examples: "compose draft", "summarize thread", "prep for [meeting name]", "check portfolio", "view worklist", "approve [draft name]", "morning brief", "end of day"
- Keyboard shortcuts as primary path; UI as fallback — not the other way around
- Research basis: Superhuman, Linear, Raycast all prove command palette drives muscle memory within first week, turning a dashboard-you-visit into a tool-you-reach-for

---

## TIER 2 — Personal Intelligence Stack

### 2.1 Auto-Built Relationship Graph (Gmail + Calendar)
- No manual entry. Built from: Gmail API thread metadata (headers only, no content), Calendar API attendee lists
- SQLite graph schema: contacts (email, name, first_seen, last_seen), interactions (contact_id, type, date, who_initiated, thread_subject, meeting_title), relationship_scores (contact_id, frequency_score, recency_score, temperature)
- Derived per contact: last contact date, who initiated most recently, open thread count, meetings together, "temperature" (going cold = no contact in N days, N calibrated per-contact to typical cadence)
- Surfaces: pre-meeting brief (1.3), morning briefing contact alert ("no contact with [client] in 23 days"), MCP tool contact_history
- Consulting value: Clay charges $134/month for an inferior version of this. You build it over your own data with zero cloud exposure.
- Weekly: "relationship health" section in retro — which consulting relationships strengthening vs. cooling

### 2.2 Cross-Session AI Memory with Structured Decay
- DB: new table in bridge-db or standalone SQLite at ~/.local/share/personal-ops/memory.db
- Schema: memory_id, content, project_tag, domain_tag, created_at, last_accessed, access_count, decay_weight
- Nightly Ollama job: re-score decay weights (recency × recurrence × relevance), merge near-duplicate entries, prune records below threshold
- Pre-session injection: hook queries DB, pulls top-N by composite score, injects as CLAUDE.md preamble or system context
- Covers: decisions made and why, approaches rejected and why, open questions, architectural choices, client context
- This answers "why does Claude not remember I rejected approach X last week?" permanently
- Bridge-db already has the MCP infrastructure — memory store is an additive table, not a new system

### 2.3 Email Corpus as Queryable Vector Database
- Nightly Gmail API pull → local ChromaDB vector store
- Embedding model: Ollama nomic-embed-text or mxbai-embed-large (runs locally, no cloud)
- Indexed by thread (not message) — preserves conversational context as retrieval unit
- Metadata stored alongside vectors: participants, dates, labels, reply latency, thread length
- Query examples: "what did the App Store reviewer say about our binary?" / "which dependency upgrade caused a support thread?" / "what did client X ask about last quarter?"
- MCP tool: email_search (semantic query → ranked thread results)
- Storage estimate: 5 years of Gmail at ~1K threads/month = ~60K threads, ~2GB vector store

### 2.4 Git Activity Knowledge Graph
- Post-commit hook across all repos in ~/Projects/: extracts entities from commit message + modified file paths via local Ollama
- Entities: feature names, bug classes, dependency names, API surface changes, file areas
- Written as triples to DuckDB: (subject, relation, object, repo, commit_sha, timestamp)
- GitHub API supplement: /repos/{owner}/{repo}/stats weekly for contributor cadence + traffic
- Query examples: "what was I working on in February that touched both iOS and Python?" → DuckDB SQL, instant
- Connects to: email corpus search (was there a thread about this feature?), calendar data (what meeting preceded this commit cluster?)

### 2.5 LifeCadenceLedger + Interruption Resume Studio Energy Correlation
- LifeCadenceLedger DB: <AppData>/life-cadence-ledger.db — tables: checkins (energy_level, focus_quality, sleep_hours, mood), habit_completions
- Interruption Resume Studio DB: <AppData>/irs.db — tables: snapshots (energy_state, task, interruption_type, resumed_at, resume_duration_seconds)
- Join: self-reported energy (ledger) vs. behaviorally-observed energy (IRS interruption patterns) — cross-validate the signals
- Output after 30 days: which time-of-day windows reliably have high energy and focus? Which interruption types cost the most recovery time?
- Feed into: morning briefing scheduling suggestions, calendar protection rules (Tier 5.1), GlassLayer overlay mode switching

### 2.6 ConvictionMapper Belief Accuracy Tracking
- DB: <AppData>/conviction.db — tables: predictions (resolved_at, outcome, confidence, domain), beliefs (confidence, domain), calibration stats
- Weekly pull: Brier score by domain, trend over time
- Cross-reference: Calibrate (iOS) CloudKit leaderboard score via CloudKit Web Services API
- Composite "judgment quality" metric: technical predictions vs. timeline predictions vs. people predictions — separate scores
- Surfaces in: weekly retro ("timeline predictions Brier score 0.31 — you're overconfident on schedules")
- This is unique intelligence available nowhere else. No other tool gives you this.

### 2.7 Plain-Text Briefing Archive (Compounding Memory)
- Every morning briefing + end-of-day digest + weekly retro writes to: ~/Notes/personal-ops/YYYY-MM-DD.md
- Format: Obsidian-compatible Markdown, YAML frontmatter with date and tags
- Zero vendor lock-in: plain files, readable by any future tool, searchable by local Ollama
- After 6 months: semantic search over your own operational history via knowledgecore (kc ask)
- After 12 months: corpus rich enough for local model fine-tuning on your work patterns
- The compounding value mechanism: stopping feels like losing the archive. This is what habit-forming tools have that abandoned tools lack.

---

## TIER 3 — Portfolio & Career Intelligence

### 3.1 iOS App Intelligence Feed (asc-mcp already connected)
- asc-mcp already configured with 100+ App Store Connect tools
- Daily pull: downloads, crash rate, conversion rate, review sentiment delta, keyword rank changes — per app (9 apps)
- Store in local DuckDB: app_metrics (app_id, date, downloads, crash_rate, conversion_rate, avg_rating, review_count)
- Weekly Ollama change narrative: not raw numbers — "crash rate +0.3% correlating with iOS 19.2 release; GhostRoutes conversion 12% below category peer median"
- Post to notification-hub: crash rate threshold breach, 1-star review spike, review approval/rejection
- Appfigures API (free tier): competitive review monitoring — sudden 1-star spikes in competitor apps = product signal
- App names with asc-mcp IDs to track: Chromafield, GhostRoutes, Calibrate, Nocturne, RoomTone, Seismoscope, Terroir, Wavelength, Liminal (9 apps)

### 3.2 Portfolio Drift Detection
- Weekly job: per repo compute drift_score = f(days_since_commit, open_issue_count, dep_vuln_count, crash_rate_delta)
- Sources: GitHub API /repos/stats, GithubRepoAuditor output, asc-mcp (for iOS repos), NetMapper CVE feed
- Top 3 drifting repos in morning briefing. GlassLayer panel: persistent badge count of at-risk repos.
- Drift thresholds: no commits in 90 days AND open issues > 3 = red; no commits in 45 days = yellow
- Output table: portfolio_drift (repo, drift_score, last_commit_date, open_issues, vuln_count, notes)
- The only way to maintain awareness of 50+ repos without constant manual monitoring

### 3.3 ApplyKit → Job Pipeline Feed
- ApplyKit already writes tracker CSV per run and stores in SQLite (rusqlite)
- Wire: each applykit generate emits POST to notification-hub + updates personal-ops job_pipeline table
- job-search-2026 folder structure: per-company folders (Carta, Ramp, Retool, Scopely, Superhuman, Sutter Health, Whatnot) + PDF artifacts
- Script: parse folder names → company + application status → lightweight ATS feed
- personal-ops surfaces: active applications, days since last follow-up, companies going cold (>7 days no activity)
- ResumeEvolver (Supabase): approved evidence snapshots + review cadence → career momentum indicator

### 3.4 Job Market Skills Demand Tracking
- JobMarketHeatmap FastAPI at 127.0.0.1:8008: GET /trends (Adzuna nightly skill demand data)
- Weekly pull into DuckDB: skill_demand (skill, date, posting_count, avg_salary, demand_delta)
- Alert via notification-hub: when a skill in your profile crosses a demand inflection point (>20% week-over-week)
- Cross-reference ResumeEvolver approved evidence: which skills you can credibly claim vs. which to build toward
- Your skill cluster to track: iOS Swift, Tauri/Rust, Python FastAPI, Claude API/MCP, eval harnesses, AI consulting
- Current market signal: AI skills commanding 43% salary premium; "eval harness" / "MCP integration" emerging in JDs

### 3.5 SpecCompanion Implementation Coverage Feed
- Output formats: JSON, HTML, CSV per repo
- Wire: SpecCompanion runs post-spec-change, writes JSON to a standard output path per repo
- personal-ops reads JSON: spec_coverage (repo, coverage_pct, unimplemented_requirements, last_run)
- Surface alongside drift score: a repo with falling coverage + no recent commits is a maintenance signal
- Useful for: ink, knowledgecore, AssistSupport, ApplyKit — projects with active spec documents

### 3.6 Personal Developer Brand Monitoring
- Weekly cron:
  - GitHub API /repos/{owner}/{repo}/traffic (views + clones) across all 50+ repos → dark funnel signal
  - HN Algolia API: search your app names + repo names → mentions without notification
  - Google Alerts integration: your name, app names, GitHub handle
- Store in DuckDB: brand_signals (source, query, date, mention_count, clone_count, view_count)
- Surface in weekly retro: "GithubRepoAuditor: 47 clones this week, 3 unique referrers — someone sharing internally"
- Clone count without star = someone is using your tool privately — high-value signal for consulting leads

### 3.7 Indie Developer BI Dashboard
- Combine in DuckDB view:
  - App Store MRR per app (asc-mcp daily pull)
  - Consulting revenue: simple personal-ops ledger entry via CLI (personal-ops revenue log --amount X --source client)
  - Time allocation: from flow state daemon (Tier 5.1) — hours per work mode per week
- Key derived metric: revenue-per-hour by channel (App Store vs. consulting)
- Most indie developers discover one channel dramatically outperforms the other on a per-hour basis
- Decision output: where to allocate next week's discretionary hours

### 3.8 Weekly Retro Digest
- Every Sunday, automatic:
  - Git commits across ~/Projects/ last 7 days (grouped by project, lines changed)
  - Calendar events attended (meeting time percentage)
  - Tasks completed vs. created ratio
  - Emails sent count + avg reply latency
  - AI session cost (bridge-db)
  - App Store metric changes (asc-mcp)
  - Job pipeline status (ApplyKit tracker)
  - Brand signal summary (clone/mention counts)
- Ollama writes 5-sentence narrative over the structured data
- Output: ~/Notes/personal-ops/retro-YYYY-WNN.md + POST to notification-hub as a summary
- Example narrative: "This week was primarily Cartograph and two client calls. App Store work got zero hours. Three applications went cold. AI spend was $24.60, mostly on eval runs. GithubRepoAuditor had the week's highest external interest."

---

## TIER 4 — Agent Crew

### 4.1 Triage Agent
- Charter: watches GitHub notifications + inbox every 15 min, surfaces ONLY items requiring a human decision
- Everything else (FYIs, bot messages, review notifications for inactive repos) → classified and archived
- Runtime: Ollama for speed/privacy; escalates to Claude API when classification confidence < threshold
- Model selection: use evals JSONL to pick the best-performing model for classification tasks
- Output: posts to personal-ops approval queue (for decisions) or notification-hub (for alerts)
- Reduces: the ambient anxiety of unchecked notification counts

### 4.2 Context Agent
- Charter: maintains the cross-session AI memory database (Tier 2.2)
- Nightly: re-score decay weights, merge near-duplicates, prune stale records, ingest new observations from bridge-db activity log
- Weekly: generate "what has this machine been working on" summary → write to briefing archive
- Also: detect when two sessions are working on related problems (same project tag) and create a handoff record in bridge-db
- This agent makes all AI sessions feel like they have persistent memory. Fundamental to the stack.

### 4.3 Portfolio Agent
- Charter: monitors repo health, App Store metrics, project drift — nightly
- Sources: GithubRepoAuditor output JSON, asc-mcp API, GitHub traffic API, SpecCompanion reports, NetMapper CVE feed
- Actions: update drift_score table, post threshold breaches to notification-hub as urgent, write weekly portfolio digest
- Also monitors: GithubRepoAuditor's own future arc candidates (Context Recovery A, Risk Integration B, Dead Code C, Automation D, Desktop Shell E) — surfaces when a new arc is ready to execute

### 4.4 Release Agent
- Charter: monitors all iOS apps in App Store Connect for state changes — every 4 hours
- Watches: review status changes (approved/rejected), crash rate > threshold, new reviews (especially 1-star clusters), phased release eligibility, TestFlight build expiry
- Posts urgent to notification-hub: review rejection, crash rate spike above 0.5% delta, 3+ 1-star reviews in 24h
- Posts informational: daily App Store status → morning briefing App Store section
- All via asc-mcp tools (already configured): builds_get_processing_status, reviews_list, app_versions_get, metrics endpoints

### 4.5 Model Router (Elo-Driven)
- Source: ModelColosseum SQLite (Elo ratings per model) + evals JSONL (pass rate, cost, wall time per task class)
- Task classes: classification, summarization, code_generation, cross_project_reasoning, draft_writing, structured_extraction
- Router logic: for each task class, pick the model with best pass_rate/cost_usd ratio from evals data
- Small fast tasks (classification, summarization) → highest-Elo small local model (Ollama)
- Complex tasks (code generation, reasoning) → highest-Elo large model (Claude API with prompt caching)
- MCP tool: route_to_model(task_description) → returns recommended model + estimated cost
- Closes the loop between what you measure (evals) and what you actually use

### 4.6 Network + Security Sentinel
- Sources: Codec flow_summaries (~/.codec/codec.db), NetMapper CVE findings (~/.netmapper/netmapper.db), MCPAudit risk scores
- Nightly agent reads all three, posts to notification-hub:
  - Unknown device on network (Codec: oui_manufacturer IS NULL, new IP)
  - New CVE matching installed package (NetMapper: new cve_id for known device)
  - MCP server risk score increased ≥ 2 points (MCPAudit baseline diff)
  - New MCP server appeared in any config
- personal-ops doctor output: new "security posture" section with current risk summary

---

## TIER 5 — Ambient & Agentic Layer

### 5.1 Flow State Detection and Protection
- Daemon: polls active window title + application every 60 seconds → SQLite time-series table
- focus_score: rolling 20-min average of sustained single-app usage, weighted by app type (IDE=1.0, terminal=0.9, browser=0.5, Slack=0.1)
- When focus_score > 0.7 for 20+ continuous minutes: POST to notification-hub to suppress non-urgent events
- When focus_score drops sharply (context switch detected): log interruption timestamp + project context from latest IRS snapshot
- Weekly Ollama analysis: actual deep work windows (day + hour heatmap), interruption sources ranked by recovery cost
- GlassLayer integration: overlay shrinks to breath indicator during confirmed focus sessions
- Rize ($14/month) does this commercially — building it locally gives privacy + integration with the rest of the stack

### 5.2 Context-Sensitive GlassLayer Overlay Modes
- Mode classifier: Ollama runs on window focus history every 5 minutes → outputs current_mode
- Modes and overlay layouts:
  - deep_focus (focus_score > 0.7, sustained): shrink to 3 numbers only (inbox urgent count, next meeting in Xm, git diff count)
  - planning (calendar block active, IDE inactive): expand to show drift count, aging email threads, App Store review delta, pending approvals
  - transition (sudden context switch): show last IRS snapshot — "last task: [X], next step: [Y]"
  - idle (no active window > 10 min): show today's calendar remaining + morning briefing summary
- This makes the overlay adaptive rather than static — information density matches cognitive state

### 5.3 Calendar as a Behavioral Dataset
- Export: 12 months Google Calendar events via API → DuckDB calendar_events table
- Clustering analysis (Ollama): which repos get commits in which calendar time slots? Do iOS release weeks reduce velocity elsewhere? Does a specific meeting precede unfinished PR spikes?
- Output: "attention allocation" report — not what you intended to work on, but what the data shows
- Weekly surface: "You scheduled 6 hours of deep work this week; behavioral data shows 2.5 hours achieved"
- This is the behavioral mirror that reveals leverage — where your time actually goes vs. where you think it goes

### 5.4 Burnout Early Warning System
- Signals (each scored 0-1, combined into burnout_risk):
  - Git: late-night commits (>10pm), shortening commit messages (char count trend), declining commit size, widening gap between commits on same file
  - LifeCadenceLedger: energy_level trending down over 14 days, sleep_hours below threshold
  - IRS: interruption frequency increasing, resume_duration_seconds increasing (taking longer to get back in)
  - Inbox: reply latency increasing (taking longer to respond to people)
- When burnout_risk > 0.6 for 3+ consecutive days: Ollama generates alert, posts to notification-hub, surfaces in morning briefing
- Lead time: typically 2-3 weeks before subjective awareness — catch it early

### 5.5 AuraFlow Pomodoro + EarthPulse Integration
- AuraFlow (FunGamePrjs): Pomodoro timer with session betting. Wire: completion events POST to notification-hub + update focus_score positively. Streak data feeds weekly retro.
- EarthPulse (FunGamePrjs): live earthquake, satellite, weather feeds. Wire: significant earthquake events (M5.0+) near configured locations POST to notification-hub. ISS pass notifications via GlassLayer. These make the machine feel alive and connected to the physical world.

---

## TIER 6 — Far Horizon

### 6.1 DuckDB as the Unified Intelligence Layer
- All project-local SQLites, GithubRepoAuditor JSON, evals JSONL, bridge-db records, App Store metrics → unified DuckDB
- DuckDB reads SQLite files natively (no ETL needed for most sources), handles Parquet, JSON, CSV
- New MCP tool: hub_query(sql) — query the entire machine's intelligence layer from any AI session
- Query examples: "what did I work on the week I shipped GhostRoutes?" / "which projects have I touched in the last 30 days?" / "what was my total AI spend in March?"
- This becomes the single queryable brain across all 40+ projects

### 6.2 Email Fine-Tuning for Personal Inference
- After 6+ months of ChromaDB email index: training-grade personal corpus
- Fine-tune a 7B local model (Llama 4 or Qwen 2.5) on your email threading patterns, client vocabulary, technical style
- Validation: ModelColosseum eval harness scores fine-tuned vs. base models on your actual task classes
- evals JSONL becomes fine-tuning validation set
- Result: a model that outperforms large cloud models on YOUR specific use cases (your writing style, your clients, your technical domain)

### 6.3 Agent Crew Orchestration (CrewAI)
- Wire the four Tier 4 agents through CrewAI with defined handoff protocols:
  - Triage flags item → Context checks memory for relevant past context → Portfolio checks if a repo is relevant → output to human decision queue with full context pre-assembled
- Eval harness scores each agent's output quality over time → swap models per agent based on empirical performance
- This is the "personal assistant with a specialist team" model — one person, four always-on specialists

### 6.4 Notion as External-Facing Knowledge Surface
- GithubRepoAuditor already has working Notion sync (notion_sync.py, notion_client.py, notion_dashboard.py)
- Extend: personal-ops writes weekly retro, portfolio health summary, job pipeline status, App Store dashboard to Notion
- Notion MCP tools (already configured) make this bidirectional: Notion comments → tasks in personal-ops
- Split: local DuckDB for private intelligence, Notion for curated external-facing professional presence

### 6.5 knowledgecore as Personal Knowledge Vault
- Already built: encrypted local KB with CLI querying (kc ask), SQLCipher-encrypted SQLite, BLAKE3-verified object store
- Wire as long-term document store: meeting notes, decision memos (from DecisionStressTest), ADRs, briefing archives
- kc ask as MCP tool: any AI session can query your full personal knowledge base on demand
- After 12 months: the most valuable single asset on the machine — a queryable record of every significant decision, meeting, and project insight

### 6.6 Raycast Extension
- Surfaces in Raycast: morning briefing status, inbox urgent count, worklist, approval queue
- 3-keystroke access from menu bar, no browser needed
- mcpforge can scaffold the MCP-to-Raycast bridge in one session (it's already an MCP tool)
- Puts personal-ops in the same reflex layer as Spotlight and clipboard

### 6.7 Voice / Global Hotkey Capture
- Global hotkey (Tauri standalone app or Hammerspoon): floating text field, accepts thought/task/follow-up in <5 seconds
- Voice input: local Whisper model via Ollama transcribes to text
- Routes to: personal-ops task queue, or inbox draft, or briefing archive note — classified by content
- Total friction from thought-to-tracked: under 10 seconds. This is what makes second-brain tools actually stick.

### 6.8 Full Relationship Intelligence
- Relationship graph (2.1) matures into: warm introduction paths (who in your network knows this person across multiple contexts?), relationship portfolio health (consulting relationships strengthening vs. cooling), community engagement (which technical communities active vs. drifting)
- Monthly surface: relationship portfolio report — not a CRM to maintain but an intelligence layer that maintains itself
- Clay charges $134/month for a worse version of this. Yours runs locally on your own data.

---

## MACHINE DATA SURFACES REFERENCE

Projects with live SQLite DBs personal-ops can read directly:
- bridge-db: ~/.local/share/bridge-db/bridge.db
- APIReverse: ~/Library/Application Support/apispy/apispy.db
- ArguMap: ~/.argumap/argumap.db
- Codec: ~/.codec/codec.db
- ConvictionMapper: <AppData>/conviction.db
- ink: <AppData>/ink.db
- Interruption Resume Studio: <AppData>/irs.db
- LifeCadenceLedger: <AppData>/life-cadence-ledger.db
- NetMapper: ~/.netmapper/netmapper.db
- Pulse Orbit: <AppData>/metrics.db
- ReturnRadar: <AppData>/return-radar.db
- DecisionStressTest: <AppData>/SQLite via Drizzle
- AssistSupport: <AppData>/SQLite encrypted
- ApplyKit: SQLite via rusqlite
- GhostRoutes: on-device GRDB SQLite

Projects with HTTP APIs personal-ops can poll:
- notification-hub: 127.0.0.1:9199 (POST /events, GET /health)
- GlassLayer: 127.0.0.1:9876 (POST /hook/{panel_id})
- JobMarketHeatmap FastAPI: 127.0.0.1:8008 (/jobs, /trends, /skills, /geo)
- BrowserHistoryVisualizer FastAPI: 127.0.0.1:8000 (GET /api/all)
- NetMapper FastAPI: /devices, /scans, /cve, /schedule
- RedditSentimentAnalyzer FastAPI: /time-series, /spikes, /subreddits

Projects with file-based outputs personal-ops can read:
- GithubRepoAuditor: ~/Projects/GithubRepoAuditor/output/ (JSON, XLSX, SQLite)
- evals: ~/Projects/evals/results/index.jsonl
- thought-trails: <AppData>/sessions/*.json + index.json
- Interruption Resume Studio: export_snapshots → JSON at chosen path
- SpecCompanion: JSON/HTML/CSV per repo
- ApplyKit: tracker CSV per --outdir
- DecisionStressTest: Markdown export per decision
- visual-album-studio: pipeline state SQLite + video output
- Afterimage: DataPipeline/output/photos.db + staging CSVs

Projects with MCP tools personal-ops can call:
- bridge-db: 16 MCP tools (log_activity, create_handoff, record_cost, save_snapshot, etc.)
- mcpforge: mcpforge-server mode exposes generation as MCP tool
- asc-mcp: 100+ App Store Connect tools (already configured)
- notification-hub: personal_ops_status, personal_ops_worklist, inbox_*, calendar_*, etc.

---

## KEY RESEARCH FINDINGS

### What makes tools habit-forming (from 10+ web searches):
1. Trigger on existing behavior, not a cron. Shell-session trigger >> fixed-time cron.
2. One required action per item, not passive reading. "Reply/snooze/ignore" >> dashboard.
3. Compound value: each day of use makes tomorrow more useful. Archive + memory >> stateless tool.
4. Radical simplicity at point of use. 30-second morning brief >> 10-minute dashboard review.
5. Command palette drives muscle memory within one week (Superhuman, Linear, Raycast proof).

### What consistently fails:
- Manual capture requirements (second-brain tools die when you stop filing)
- Elaborate dashboards with no push (you have to remember to look)
- Feature bloat before core loops are frictionless
- Tools that feel unpredictable about what they'll do autonomously

### Architecture principles validated by research:
- DuckDB: best local analytics layer (zero-server, fast, reads SQLite natively)
- Ollama: production-ready for classification, summarization, extraction at personal scale
- Plain Markdown files: more durable than any database for 3+ year knowledge stores
- MCP as integration bus: the correct abstraction for connecting all of this

### Competitors and what they charge for worse versions:
- Clay (relationship intelligence): $134/month
- Rize (flow state detection): $14/month  
- Appfigures (App Store analytics): free tier covers 80% of needs
- RevenueCat (subscription analytics): $0 for <$2.5K MRR
- Superhuman (email): $30/month — command palette pattern only
- Shortwave: 45% faster inbox-zero with binary reply/no-action framing

---

## v0.2.0 Release Status
- Branch ready: release/v0.2.0 (commits e4e02e0 changelog date + 78fdfe6 version bump)
- All checks passed: typecheck, tests, verify:all, desktop build
- To complete merge: cd /Users/d/.local/share/personal-ops && git checkout main && git merge release/v0.2.0 && git tag v0.2.0 && git push origin main v0.2.0
- GitHub Actions release.yml will publish the GitHub Release automatically from CHANGELOG.md

---

## SESSION CONTEXT (2026-04-14)
- This roadmap was produced in session 2026-04-14
- Inputs: deep machine audit of 40+ projects, 20+ web searches across two research agents
- All security alerts resolved: rand alert #13 dismissed (build-time only, tolerable_risk), npm alerts #1-12 all fixed
- personal-ops is on main at cfb50f4, working tree clean, synced with origin/main
- release/v0.2.0 branch ready to merge — user needs to run the git commands above
- Next session should start by completing the v0.2.0 release, then begin F1 (notification-hub wiring)

- Branch: release/v0.2.0 (commits e4e02e0 + 78fdfe6)
- All checks passed (typecheck, tests, verify:all, desktop build)
- To complete: git checkout main && git merge release/v0.2.0 && git tag v0.2.0 && git push origin main v0.2.0
