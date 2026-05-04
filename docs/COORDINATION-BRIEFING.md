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

Include a read-only diff from a manually supplied prior snapshot with:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json
```

Choose a read-only baseline from operator-supplied candidate snapshots with:

```bash
personal-ops coordination briefing --for chatgpt --against previous --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
personal-ops coordination briefing --for chatgpt --against last-green --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
```

For structured inspection:

```bash
personal-ops coordination briefing --for chatgpt --json
```

Validate the generated packet contract before sending it to ChatGPT with:

```bash
personal-ops coordination briefing --for chatgpt --self-check
```

The command builds the current `personal-ops coordination snapshot` first, then formats a compact Markdown packet from that verified local state. When `--from` or `--against ... --candidate` is supplied, it includes the same read-only diff model used by `personal-ops coordination diff`.

By default, a briefing with `--from` also includes a short read-only `Significant Changes` section. That section is generated from deterministic diff classification rules in `docs/COORDINATION-CHANGE-CLASSIFICATION.md`.

It also includes a short read-only `Suggested Verification Prompts` section. That section is generated from deterministic prompt rules in `docs/COORDINATION-VERIFICATION-PROMPTS.md` and stays human-readable by default.

When no prior diff is supplied, or when the supplied diff is empty, the briefing switches to `baseline_verification` mode and emits minimal read-only trust checks from `docs/COORDINATION-BASELINE-VERIFICATION.md`.

Disable the classification or prompt sections with:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json --no-classify
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json --no-prompts
```

## Packet Shape

The briefing includes:

- packet ID
- creation time
- explicit coordination mode: `diff` or `baseline_verification`
- Codex app and in-app browser setup
- source-of-truth boundary reminder
- snapshot schema and current health, labeled separately from any prior snapshot health
- repo posture for the active local coordination repos
- source availability for GithubRepoAuditor, bridge-db, notification-hub, and deferred Notion
- optional changed fields from a manually supplied prior snapshot
- the selected baseline label when a diff is included
- optional significant change classifications from those changed fields
- read-only verification prompts from either diff classification or baseline verification mode
- a local verification checklist for Codex
- the ChatGPT response structure Codex expects back
- boundaries that keep ChatGPT advice downstream of local verification
- a link to the ChatGPT response contract that keeps responses advisory

## Self-Check

`--self-check` validates the generated packet without sending it or writing new state. It checks:

- required packet sections
- required ChatGPT response sections
- advisory-only boundaries
- deferred Notion lane language
- verification prompts that match `diff` or `baseline_verification` mode
- consistency between the declared mode and diff fields
- absence of direct mutation instructions

The command exits nonzero if the packet contract fails or if the current coordination snapshot is not green.

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

ChatGPT responses follow `docs/CHATGPT-RESPONSE-CONTRACT.md`. The response is advisory until Codex verifies it locally and the user approves any action that needs approval.

## Read-Only Diff

When a prior snapshot was manually saved by the operator, compare it with the current live snapshot using:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json
```

For deterministic baseline selection from candidate files:

```bash
personal-ops coordination diff --against previous --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
personal-ops coordination diff --against last-green --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
```

For structured inspection:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --json
```

Include deterministic read-only classification with:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --classify
```

Include deterministic read-only verification prompts with:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json --with-prompts
```

The diff accepts either a full `{"coordination_snapshot": ...}` command output file or the raw snapshot object. It does not write a new snapshot file. It only reports repo, source, and health fields that changed.

`--against last-green` chooses the newest supplied candidate whose `health.overall` is `green`. This avoids replaying stale yellow comparison state into a current green ChatGPT packet.

When a prior snapshot is supplied, the briefing must label prior health as comparison-only and current health as authoritative for the present packet. This prevents yellow-to-green transitions from being read as current yellow health.

Classification is additive and derived only from the diff. It labels change meaning, but it does not decide actions.

Verification prompts are additive and derived only from classifications. They tell Codex what to verify, not what to do.

When the diff is empty, the packet does not stay silent. It uses baseline verification prompts instead. These are minimal trust checks derived only from the current snapshot, not from classification.

Use the diff when ChatGPT only needs to understand what changed since the last loop. Use the full briefing when changed fields affect sequencing, risk, or user-facing recommendations.

If ChatGPT needs both current state and changes, prefer:

```bash
personal-ops coordination briefing --for chatgpt --from /path/to/prior-coordination-snapshot.json
```

This keeps one packet shape while still making the change set visible.

## What Not To Do Yet

- Do not build a dashboard.
- Do not write generated briefings to state by default.
- Do not route briefing output into Notion.
- Do not create bridge-db handoff records automatically.
- Do not make notification-hub react to briefing changes.
- Do not add task routing, alerting, or automation until the manual loop proves stable.

## Expansion Gate

The next safe expansion is still read-only: compact and verbose output modes for the generated briefing.

Only add those after the generated briefing with optional diff, v0 classification, and v0 verification prompts has been used in real loops and its packet shape stays stable.
