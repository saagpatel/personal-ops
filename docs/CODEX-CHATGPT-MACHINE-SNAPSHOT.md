# Codex-ChatGPT Machine Snapshot

Snapshot ID: handoff-20260503-124815-cross-project-machine-map
Created: 2026-05-03 12:48:15 PDT
Status: Draft snapshot sent to ChatGPT; refreshed against local git status on 2026-05-03 22:51 PDT

## Purpose

This snapshot gives ChatGPT a grounded view of the local operating system that Codex is working inside.

The goal is not to dump the machine. The goal is to give ChatGPT enough verified structure to give better strategic advice without pretending it has live filesystem access.

Use this with the protocol in `docs/CHATGPT-CODEX-HANDOFF.md`.

## Source Rules

- Current user instruction wins.
- Verified local repo, filesystem, command, and browser evidence wins over ChatGPT memory.
- Durable local docs and current-state notes are useful, but can be stale.
- ChatGPT memory is strategy/context, not proof of current machine state.
- ChatGPT advice is not permission to mutate local files, send messages, publish updates, or perform live external actions.
- Do not include secrets, tokens, credentials, private raw logs, or large local dumps in ChatGPT packets.

## The Five-Project System

These projects are being used together as one local operating layer:

1. `personal-ops` at `/Users/d/.local/share/personal-ops`
2. `Notion` at `/Users/d/Notion`
3. `GithubRepoAuditor` at `/Users/d/Projects/GithubRepoAuditor`
4. `bridge-db` at `/Users/d/Projects/bridge-db`
5. `notification-hub` at `/Users/d/Projects/notification-hub`

The user called one project `GitHubrepoeditor`; current local evidence points to `GithubRepoAuditor` as the intended repo.

## Operating Model

`personal-ops` is the operator-facing hub. It gathers inbox, calendar, planning, GitHub, Drive, drafts, approvals, and assistant-safe operational reads into one local-first control surface. It should not become the source of truth for every sibling system. Its current Operator Inbox reads sibling-system signals as adapters.

`Notion` is the human-facing project and portfolio control tower. It owns Notion publishing, Local Portfolio Projects, weekly review flow, governed GitHub/Vercel actions, project signal sync, and Notion-side summaries. It is dry-run-first and live writes require explicit approval.

`GithubRepoAuditor` is the workbook-first GitHub portfolio truth engine. It audits repos, scores portfolio maturity, produces workbook/report/control-center outputs, and generates the canonical local portfolio truth snapshot used by other local tools.

`bridge-db` is the cross-agent state bridge. It is a SQLite-backed MCP server for shared state across Claude.ai, Claude Code, Codex, Notion OS, and personal-ops. It handles handoffs, snapshots, activity, shipped events, compact context sections, lexical recall, and observability. It is not a general knowledge warehouse.

`notification-hub` is the local notification router. It accepts local AI-tool events, watches the bridge markdown fallback file, classifies urgency, writes JSONL event logs, and routes notifications to local push and Slack according to deterministic policy.

## How They Connect

`personal-ops` reads from:

- Notion OS project snapshot: `/Users/d/.local/share/notion-os/project-snapshot.json`
- GithubRepoAuditor portfolio truth: `/Users/d/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json`
- bridge-db MCP command: `uv run --directory /Users/d/Projects/bridge-db python -m bridge_db`
- notification-hub event log: `/Users/d/.local/share/notification-hub/events.jsonl`
- notification-hub HTTP intake: `http://127.0.0.1:9199/events`

`Notion` reads and writes Notion as the portfolio control surface, and has adapters or signal flows for GitHub, bridge-db, notification-hub, and repo-auditor style inputs.

`GithubRepoAuditor` generates `portfolio-truth-latest.json`, dated audit artifacts, workbook output, control-center output, and weekly command-center output. It tracks `bridge-db` and `notification-hub` as portfolio projects, but does not directly control their runtimes.

`bridge-db` uses MCP as the primary coordination path. Markdown export remains a compatibility fallback for file-based clients. `notion_os` and `personal_ops` are first-class activity/cost callers; `cc` and `codex` own snapshots.

`notification-hub` accepts `personal-ops` and `notion-os` as first-class event sources. It does not directly query bridge-db today; its bridge interface is the markdown fallback file.

## Current Verified State

`personal-ops`:

- Git: `main` is aligned with `origin/main`.
- Latest commit: `d8e9711 docs: add ChatGPT Codex handoff protocol`.
- Wrapper and desktop repair completed on 2026-05-03 after the scan found stale provenance.
- `personal-ops install check --json`: `ready`, `62 pass / 0 warn / 0 fail`.
- `personal-ops health check --deep --json`: `ready`, `6 pass / 0 warn / 0 fail`.

`Notion`:

- Git: `main` is aligned with `origin/main`, with local command-center ID edits in:
  - `config/destinations.json`
  - `config/local-portfolio-control-tower.json`
- Governance check: `npm run governance:health-report` reports `status: healthy` and no immediate operator follow-up.
- Local Notion OS snapshot exists at `/Users/d/.local/share/notion-os/project-snapshot.json`, modified 2026-05-03 09:54:44 PDT.

`GithubRepoAuditor`:

- Git: `main` is clean and aligned with `origin/main`.
- Latest local commit: `2bebc6b chore: add repo guidance for Codex`.
- Doctor check: `python3 -m src saagpatel --doctor` reports no blocking errors and 3 warnings.
- Warnings: no `audit-config.yaml`, no `NOTION_TOKEN`, and missing `config/notion-config.json`.
- Latest portfolio truth: `/Users/d/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json`, generated `2026-05-03T16:57:05.288273+00:00`, with 115 projects.

`bridge-db`:

- Git: `main` is clean and aligned with `origin/main`.
- Latest local commit: `ff45c51 chore: add repo guidance for Codex`.
- Live status: `uv run python -m bridge_db --status` reports overall healthy.
- DB: exists at `/Users/d/.local/share/bridge-db/bridge.db`, schema v3.
- Bridge file: exists and was about 1.1 hours old during this scan.
- Signals: 0 pending handoffs and 0 unprocessed shipped events during this scan.

`notification-hub`:

- Git: `main` is clean and aligned with `origin/main`.
- Latest local commit: `cb0d38f chore: add repo guidance for Codex`.
- Runtime status: `uv run --frozen notification-hub-status --json` reports `status: ok`.
- Daemon reachable: true at `http://127.0.0.1:9199/health/details`.
- Watcher active: true.
- Runtime wiring current: true.
- Slack configured and push notifier available according to status.
- Optional policy config was not found, so defaults are in use.

## Active Cautions

- `Notion` has local command-center ID edits; do not assume a clean tree there until those edits are reviewed.
- `GithubRepoAuditor` has Notion integration warnings in doctor output because Notion token/config are not available in that repo context.
- `notification-hub` reports healthy, but Slack delivery should not be treated as end-to-end proven unless a fresh send/smoke path is explicitly approved and run.
- bridge-db should not be expanded into a broad knowledge store; current scope is state coordination plus lexical recall and observability.

## What ChatGPT Should Know Before Advising

- This is a local, multi-repo operating system, not one app.
- The correct coordination order is: verified local state first, ChatGPT memory second.
- `personal-ops` is the operator hub and can aggregate signals, but sibling systems retain ownership of their own state.
- `Notion` is the human project-control layer and is dry-run-first for Notion/GitHub/Vercel actions.
- `GithubRepoAuditor` is the portfolio truth generator, not a live automation authority by itself.
- `bridge-db` is the machine-readable cross-agent bridge and future home for compact handoff records after the manual loop proves useful.
- `notification-hub` is local notification routing and noise control, not a project truth source.
- A good next suggestion should improve cross-tool coordination without adding another source of truth.

## What ChatGPT Must Not Assume

- Do not assume docs marked "current" are fully current.
- Do not assume local commits have been pushed unless Codex says so.
- Do not assume health checks are green if the latest Codex packet reports warnings.
- Do not assume approval equals live apply.
- Do not assume Notion, GithubRepoAuditor, bridge-db, personal-ops, and notification-hub are all directly integrated with each other.
- Do not recommend broad automation before the manual handoff loop is useful and trusted.
- Do not ask Codex to send, publish, mutate, repair installs, or run live external writes without explicit user approval.

## Recommended Next Coordination Moves

1. Review this snapshot with the user.
2. Review the Notion local command-center ID edits before treating the Notion repo as clean.
3. Decide whether this snapshot should be pasted into ChatGPT as-is or trimmed for a narrower strategy question.
4. Send this snapshot to ChatGPT in the `Codex-ChatGPT` project and ask for strategic advice only after the user approves the packet.
5. Keep the first ChatGPT ask focused on cross-tool coordination, not new automation.

## Paste-Ready ChatGPT Ask

```markdown
# Codex -> ChatGPT Handoff

Packet ID: handoff-20260503-124815-cross-project-machine-map
Created: 2026-05-03 12:48 PDT
Mode: General cross-tool coordination
ChatGPT Project: Codex-ChatGPT

## Setup

- We are using the Codex app.
- Codex is using the in-app browser tool.
- The user is logged in to ChatGPT inside the Codex app browser.
- ChatGPT contributes memory-based and strategic context.
- Codex contributes verified local state and executes local work.
- Repo evidence wins over ChatGPT memory.

## Verified Local Facts

Codex created a local machine snapshot covering five coordinated projects:

- `personal-ops`: operator-facing local workflow hub.
- `Notion`: Notion-based project and portfolio control tower.
- `GithubRepoAuditor`: workbook-first GitHub portfolio truth generator.
- `bridge-db`: SQLite-backed MCP state bridge.
- `notification-hub`: localhost notification routing daemon.

Current cautions:

- `personal-ops` is currently ready after wrapper and desktop refresh.
- `Notion` governance is healthy, but the repo has local command-center ID edits.
- `GithubRepoAuditor`, `bridge-db`, and `notification-hub` are clean and aligned with their remotes.
- `bridge-db` is a state bridge, not a general knowledge store.
- `notification-hub` is healthy by status, but Slack delivery should not be treated as end-to-end proven without a fresh approved smoke/send path.

## Current Goal

Help us improve how these five local projects work together without creating another source of truth or adding premature automation.

## What Codex Needs From ChatGPT

- Use your memory of the user's working style and long-running goals to suggest the best cross-tool coordination shape.
- Identify the highest-leverage next moves across these projects.
- Separate memory-based context from inference.
- Do not claim current local facts beyond what Codex provided.

## Boundaries

- Do not recommend live sends, external publishing, install repair, or repo mutation as already approved.
- Do not treat this as permission to execute local changes.
- Keep command output summarized unless exact excerpts are necessary.
```
