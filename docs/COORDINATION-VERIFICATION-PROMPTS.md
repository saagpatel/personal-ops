# Coordination Verification Prompts

Status: Draft v0 read-only contract
Last reviewed: 2026-05-04

This document defines the first verification prompt layer for Codex-to-ChatGPT coordination loops.

Verification prompts are derived only from `personal-ops coordination diff --classify`. They are human-readable checks. They do not execute commands, write files, update Notion, create bridge-db records, post notifications, mutate git, or decide actions.

## Command

Generate diff, classification, and verification prompts:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --with-prompts
```

Include verification prompts in a ChatGPT briefing:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json
```

Disable briefing prompts while the contract evolves:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json --no-prompts
```

## Boundary

Verification prompts answer: "what should Codex verify?"

They do not answer: "what should Codex do?"

Prompts must stay read-only, short, deterministic, and downstream of classification. They are additive guidance for local verification, not execution approval or automation input.

## Allowed Prompt Types

The prompt `source_type` must match one of the classification types from `docs/COORDINATION-CHANGE-CLASSIFICATION.md`:

- `repo_state_recovery`
- `repo_state_regression`
- `repo_branch_change`
- `commit_advance`
- `health_transition`
- `source_availability_change`
- `source_metadata_change`

## Mapping Rules

| Classification | Prompt shape |
| --- | --- |
| `repo_state_recovery` | Confirm the repo is clean, on the expected branch, and aligned with upstream before relying on the recovery. |
| `repo_state_regression` | Inspect repo posture before any implementation that depends on it. |
| `repo_branch_change` | Confirm the repo is on the branch the current work expects. |
| `commit_advance` | Confirm commit movement matches the intended local work. |
| `health_transition` | Confirm Personal Ops health is still stable before using the packet as a clean baseline. |
| `source_availability_change` | Confirm source availability before relying on coordination facts from that source. |
| `source_metadata_change` | Review metadata movement if it affects sequencing or risk. |

## Safety Rules

- Do not include mutating commands.
- Do not include `git commit`, `git push`, file writes, deletes, send actions, uploads, or approval actions.
- Do not add urgency or priority scoring.
- Do not infer user intent.
- Do not pull Notion into this lane.
- Do not turn prompts into multi-step workflows.

## What Not To Do Yet

- Do not auto-run prompts.
- Do not route prompts into notification-hub.
- Do not create bridge-db records from prompts.
- Do not build a dashboard.
- Do not expand prompts beyond human-readable checks until the manual loop proves stable.
