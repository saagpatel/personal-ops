# Coordination Change Classification

Status: Draft v0 read-only contract
Last reviewed: 2026-05-04

This document defines the first change classification layer for Codex-to-ChatGPT coordination loops.

Classification is derived only from `personal-ops coordination diff`. It does not call sibling systems, read ChatGPT memory, write files, update Notion, create bridge-db records, post notifications, mutate git, or decide actions.

## Command

Generate a diff with deterministic classification:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --classify
```

Include classification in a ChatGPT briefing:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json
```

Include derived verification prompts with the diff:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --with-prompts
```

Disable briefing classification while the contract evolves:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json --no-classify
```

## Boundary

Classification labels what changed. It does not decide what to do.

Use it to help ChatGPT and Codex focus review on the most meaningful changes. Do not use it as execution approval, task routing, alert routing, or automation input until the manual loop proves stable.

## Allowed Types

| Type | Meaning |
| --- | --- |
| `repo_state_recovery` | Repo posture improved, such as dirty to clean, degraded to available, or divergence returning to zero. |
| `repo_state_regression` | Repo posture now needs attention, such as clean to dirty, available to degraded, or divergence appearing. |
| `repo_branch_change` | A tracked repo changed branch. |
| `commit_advance` | A tracked repo changed commit. |
| `health_transition` | Overall, install, deep health, or issue summary changed. |
| `source_availability_change` | A sibling source changed availability state. |
| `source_metadata_change` | Source metadata changed without an availability transition. |

## Severity

Keep severity minimal:

| Severity | Meaning |
| --- | --- |
| `high` | Verify before action because readiness, repo posture, availability, or issues changed materially. |
| `medium` | Verify before depending on the changed area, but it does not by itself imply a broken loop. |
| `low` | Useful context for review, usually expected commit or metadata movement. |

## Deterministic Rules

- Repo recovery and regression fields classify as high when they move between healthy and attention-needed values.
- Repo branch changes classify as medium.
- Repo head changes classify as low `commit_advance`.
- Health overall and issue changes classify as high.
- Other health transitions classify as medium.
- Source state changes classify as `source_availability_change`; transitions into degraded or unavailable are high, and recoveries are medium.
- Other source changes classify as low `source_metadata_change`.
- No-op diffs produce zero classifications.

## What Not To Do Yet

- Do not add urgency scoring.
- Do not encode user intent.
- Do not infer active projects.
- Do not pull Notion into this lane.
- Do not trigger notifications from classifications.
- Do not make ChatGPT recommendations execution permission.
- Do not treat verification prompts as actions; they are covered by `docs/COORDINATION-VERIFICATION-PROMPTS.md`.
