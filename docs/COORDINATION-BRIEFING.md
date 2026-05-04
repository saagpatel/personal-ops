# Coordination Briefing

Status: Draft read-only handoff surface
Last reviewed: 2026-05-04

This document defines the Markdown briefing generated from the read-only coordination snapshot for Codex-to-ChatGPT loops.

The briefing is a derived packet. It is not a source of truth, does not write files, does not update Notion, does not create bridge-db records, does not post notifications, and does not mutate git repos.

## Command

Generate a paste-ready ChatGPT handoff packet with:

```bash
personal-ops coordination briefing --for chatgpt
```

For structured inspection:

```bash
personal-ops coordination briefing --for chatgpt --json
```

The command builds the current `personal-ops coordination snapshot` first, then formats a compact Markdown packet from that verified local state.

## Packet Shape

The briefing includes:

- packet ID
- creation time
- Codex app and in-app browser setup
- source-of-truth boundary reminder
- snapshot schema and overall health
- repo posture for the active local coordination repos
- source availability for GithubRepoAuditor, bridge-db, notification-hub, and deferred Notion
- the ChatGPT response structure Codex expects back
- boundaries that keep ChatGPT advice downstream of local verification

Packet IDs use:

```text
handoff-YYYYMMDDTHHMMSS-coordination-snapshot
```

## Current Loop

The intended manual loop is:

```text
personal-ops coordination snapshot --json
personal-ops coordination briefing --for chatgpt
paste packet into the Codex-ChatGPT project
bring ChatGPT's structured response back to Codex
Codex verifies locally before implementation
```

This keeps ChatGPT useful for memory, strategy, risk framing, and sequencing without letting it become proof of local state.

## Read-Only Diff

When a prior snapshot was manually saved by the operator, compare it with the current live snapshot using:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json
```

For structured inspection:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --json
```

The diff accepts either a full `{"coordination_snapshot": ...}` command output file or the raw snapshot object. It does not write a new snapshot file. It only reports repo, source, and health fields that changed.

Use the diff when ChatGPT only needs to understand what changed since the last loop. Use the full briefing when changed fields affect sequencing, risk, or user-facing recommendations.

## What Not To Do Yet

- Do not build a dashboard.
- Do not write generated briefings to state by default.
- Do not route briefing output into Notion.
- Do not create bridge-db handoff records automatically.
- Do not make notification-hub react to briefing changes.
- Do not add task routing, alerting, or automation until the manual loop proves stable.

## Expansion Gate

The next safe expansion is still read-only: a briefing diff formatter that can turn the snapshot diff into a shorter ChatGPT packet.

Only add that after the generated briefing and snapshot diff have been used in real loops and their packet shapes stay stable.
