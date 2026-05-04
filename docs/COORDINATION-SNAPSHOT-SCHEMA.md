# Coordination Snapshot Schema

Status: Draft v1 read-only contract
Last reviewed: 2026-05-04

This document defines the first coordination snapshot used by Codex and ChatGPT handoff loops.

The snapshot is a derived lens over existing local systems. It is not a source of truth, does not write to sibling projects, and must preserve source ownership when data is missing or stale.

## Command

Generate the v1 snapshot with:

```bash
personal-ops coordination snapshot --json
```

For a compact human view:

```bash
personal-ops coordination snapshot
```

The command is read-only. It does not write a state file, update Notion, mark bridge-db records, post notifications, or mutate git repos.

Compare a manually supplied prior snapshot file with the current live snapshot using:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json
```

The diff command is also read-only. It accepts either a full `{"coordination_snapshot": ...}` command output file or the raw snapshot object, then reports changed repo, source, and health fields.

Add deterministic read-only change classification with:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --classify
```

Classification consumes only the diff output. It labels significance for review and does not decide actions.

Add human-readable read-only verification prompts with:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --with-prompts
```

Verification prompts consume only classification output. They tell Codex what to verify, not what to do.

## Scope

Included in v1:

- `personal-ops` repo posture and local install/runtime readiness
- `GithubRepoAuditor` repo posture and portfolio-truth availability
- `bridge-db` repo posture and MCP runtime availability
- `notification-hub` repo posture, health endpoint availability, and recent local event count

Deferred in this lane:

- `Notion` repo inspection, Notion API reads, and Notion writes

Notion is intentionally deferred because active Notion work is handled in a separate lane. The snapshot should say that plainly instead of reading or summarizing half-owned Notion state.

## Source Ownership

| Field | Source of truth | Notes |
| --- | --- | --- |
| `repos[].branch`, `repos[].head`, `repos[].clean`, `repos[].ahead`, `repos[].behind` | The local git checkout for that repo | Derived by git commands only. |
| `health.install_check_state` | `personal-ops` install check | Built from the local install report. |
| `health.deep_health_state` | `personal-ops health check --deep` daemon response | If unreachable, the snapshot records `unavailable`. |
| `sources.github_repo_auditor` | `/Users/d/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json` | Read-only summary through the existing portfolio reader. |
| `sources.bridge_db` | `/Users/d/Projects/bridge-db` MCP runtime | Availability only in v1. No handoffs are created, cleared, or marked. |
| `sources.notification_hub` | `http://127.0.0.1:9199/health` and local `events.jsonl` | Health and event-count only in v1. No events are posted. |
| `sources.notion` | `/Users/d/Notion` and the Notion workspace | Deferred in this lane. |
| change classification | `personal-ops coordination diff` output | Derived only from changed fields. It must not call sibling systems. |
| verification prompts | change classification output | Derived only from classifications. They must stay human-readable and read-only. |

If a future field has more than one possible owner, do not add it until the owner is explicit.

## JSON Shape

```json
{
  "coordination_snapshot": {
    "schema_version": "1.0.0",
    "generated_at": "ISO-8601",
    "machine": {
      "hostname": "string",
      "user": "string"
    },
    "scope": {
      "mode": "read_only",
      "notion_lane": "deferred",
      "description": "string"
    },
    "repos": [
      {
        "name": "personal-ops",
        "path": "/Users/d/.local/share/personal-ops",
        "branch": "main",
        "upstream": "origin/main",
        "head": "short sha",
        "last_commit_subject": "string",
        "clean": true,
        "ahead": 0,
        "behind": 0,
        "state": "available",
        "message": null,
        "source_of_truth": "string"
      }
    ],
    "sources": {
      "github_repo_auditor": {
        "name": "GithubRepoAuditor portfolio truth",
        "state": "available",
        "source_of_truth": "/Users/d/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json",
        "message": "string",
        "generated_at": "ISO-8601 or null",
        "project_count": 0,
        "briefing_line": "string or null"
      },
      "bridge_db": {
        "name": "bridge-db",
        "state": "available",
        "source_of_truth": "/Users/d/Projects/bridge-db",
        "message": "string"
      },
      "notification_hub": {
        "name": "notification-hub",
        "state": "available",
        "source_of_truth": "http://127.0.0.1:9199/health and local events.jsonl",
        "message": "string",
        "recent_event_count": 0
      },
      "notion": {
        "name": "Notion",
        "state": "deferred",
        "source_of_truth": "/Users/d/Notion and Notion workspace",
        "message": "string"
      }
    },
    "health": {
      "overall": "green",
      "install_check_state": "ready",
      "deep_health_state": "ready",
      "issues": []
    },
    "next_actions": []
  }
}
```

## State Rules

- `green`: included repo posture is clean and synced, install check is ready, and deep health is ready.
- `yellow`: at least one included source is degraded, dirty, ahead, behind, or health is unavailable without a hard failure.
- `red`: an included repo is unavailable, install check is degraded, or deep health is degraded.

The command exits non-zero when `health.overall` is not `green`.

Use `personal-ops health explain --json` when a packet, automation, or operator note needs to explain why health is `ready`, `attention_needed`, or `degraded`. The explanation is read-only and derived from the same health checks; it does not create another health source of truth.

## What Not To Do Yet

- Do not create a dashboard.
- Do not write the snapshot into Notion.
- Do not make notification-hub subscribe to snapshot changes yet.
- Do not store broad transcripts or machine dumps in bridge-db.
- Do not add sibling-system writes behind this command.

## Next Expansion Gate

Only expand this contract after the manual Codex-to-ChatGPT loop proves the snapshot is useful. The next safe additions would be narrow read-only fields with one clear owner each.
