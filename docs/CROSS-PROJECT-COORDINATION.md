# Cross-Project Coordination

Status: Draft coordination contract
Last reviewed: 2026-05-03 22:51 PDT

This note defines how `personal-ops` should coordinate with the adjacent local operating projects without becoming another source of truth.

Use this alongside `docs/CHATGPT-CODEX-HANDOFF.md` and `docs/CODEX-CHATGPT-MACHINE-SNAPSHOT.md`.

## Purpose

The five-project operating layer is:

- `personal-ops`: operator-facing coordination hub
- `Notion`: human project and portfolio control tower
- `GithubRepoAuditor`: GitHub portfolio truth generator
- `bridge-db`: compact cross-agent state bridge
- `notification-hub`: local notification and noise-routing daemon

The coordination goal is to make those systems easier to use together while preserving ownership boundaries.

## Ownership Boundaries

`personal-ops` may aggregate and summarize sibling-system signals for the operator.

It must not silently become the owner of sibling-system truth:

- Notion-owned project and portfolio decisions stay in the Notion operating layer.
- GitHub portfolio truth stays in `GithubRepoAuditor` outputs.
- Cross-agent state stays in `bridge-db`.
- Notification routing, urgency classification, and noise suppression stay in `notification-hub`.
- Sends, publishes, live external writes, auth changes, deletion, and risky repairs stay operator-approved.

## Current Read Boundaries

`personal-ops` can read these local surfaces:

- Notion OS project snapshot: `/Users/d/.local/share/notion-os/project-snapshot.json`
- GithubRepoAuditor portfolio truth: `/Users/d/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json`
- bridge-db MCP command: `uv run --directory /Users/d/Projects/bridge-db python -m bridge_db`
- notification-hub event log: `/Users/d/.local/share/notification-hub/events.jsonl`
- notification-hub HTTP intake: `http://127.0.0.1:9199/events`

These reads are adapters. Unavailable or stale sibling-system reads should appear as source state, not as `personal-ops` failures.

## Source Of Truth Order

When coordinating across the five projects, use this order:

1. Current user instruction
2. Fresh local repo, filesystem, command, MCP, and browser evidence
3. Durable current-state docs in the owning repo
4. ChatGPT or other assistant memory
5. Inference

If these disagree, preserve the disagreement instead of smoothing it away.

## ChatGPT Role

ChatGPT can help with:

- memory-based strategy
- risk framing
- prompt and packet refinement
- coordination shape
- questions Codex should ask before acting

ChatGPT should not be treated as proof of current local repo state, and its advice is not approval to mutate local files or external systems.

## Deferred Work

Do not start with new automation or another dashboard.

Later, if the manual loop proves useful, `bridge-db` can store compact handoff records:

- packet ID
- source and target assistant
- project path
- verified facts summary
- requested help
- response summary
- user-approved next action

The first bridge-db version should store compact summaries, not transcripts or broad machine dumps.

## Good Next Moves

- Keep `docs/CODEX-CHATGPT-MACHINE-SNAPSHOT.md` current enough to orient ChatGPT before strategic asks.
- Keep `docs/CURRENT-STATE.md` honest about local health and sibling-system posture.
- Review sibling-system dirty trees or ahead/behind state before asking ChatGPT for coordination advice.
- Prefer small documentation and read-model improvements before automation.
