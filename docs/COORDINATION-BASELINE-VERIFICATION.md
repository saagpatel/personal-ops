# Coordination Baseline Verification

Status: Draft read-only fallback contract
Last reviewed: 2026-05-04

This document defines the baseline verification mode for Codex-to-ChatGPT coordination packets.

Baseline verification is a read-only fallback for stable moments. It answers one question:

```text
What should Codex confirm to trust this current baseline?
```

It does not execute commands, write files, update Notion, create bridge-db records, post notifications, mutate git, or decide actions.

## When It Triggers

Baseline verification is always on when a ChatGPT briefing has no meaningful diff signal:

- no prior snapshot was supplied
- a prior snapshot was supplied but the diff is empty

When the diff has changed fields, the briefing stays in `diff` mode and uses the existing diff classification and verification prompt path.

The packet must declare the mode explicitly:

```text
Coordination Mode: baseline_verification
```

or:

```text
Coordination Mode: diff
```

There is no silent fallback.

## Allowed Prompt Scope

Baseline prompts derive only from the current coordination snapshot.

Allowed prompt entities:

- `repos`
- `health`
- `sources`
- `notion`

Allowed checks:

| Entity | Prompt shape |
| --- | --- |
| `repos` | Confirm included repos are clean, on expected branches, and aligned with upstream. |
| `health` | Confirm Personal Ops health is ready and has no current health issues. |
| `sources` | Confirm required coordination sources remain reachable. |
| `notion` | Confirm Notion remains intentionally deferred unless the user reopens it in this lane. |

## Boundaries

Baseline verification must stay:

- minimal
- deterministic
- current-snapshot-derived
- read-only
- separate from diff classification

Baseline verification must not:

- copy all diff-mode verification prompts
- add severity scoring
- infer user intent
- create a checklist engine
- pull Notion into this lane
- mix baseline and diff prompts without labeling

## JSON Contract

Briefings include:

```json
{
  "coordination_mode": "baseline_verification",
  "verification_prompts": {
    "included": true,
    "total_prompts": 4,
    "source": "baseline_verification"
  }
}
```

Diff-driven prompt packets use:

```json
{
  "coordination_mode": "diff",
  "verification_prompts": {
    "included": true,
    "total_prompts": 1,
    "source": "diff_classification"
  }
}
```

If prompts are explicitly disabled, `source` is `null`.

## What Not To Do Yet

- Do not store "last baseline validated at" as mutable truth.
- Do not add a dashboard.
- Do not trigger notifications from baseline prompts.
- Do not route baseline prompts into bridge-db automatically.

This mode keeps quiet weeks useful without making the coordination layer noisy.
