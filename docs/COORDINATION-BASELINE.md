# Coordination Baseline

Status: Draft read-only baseline selection contract
Last reviewed: 2026-05-04

This document defines how Codex-to-ChatGPT coordination packets choose the prior snapshot used for comparison.

The baseline selector is read-only. It does not write a baseline file, update bridge-db, create Notion records, post notifications, or mutate git repos. It only chooses from snapshot JSON files explicitly supplied by the operator.

## Why This Exists

Early coordination loops compared the current snapshot with whichever prior snapshot was manually supplied through `--from`.

That was useful, but it made the packet easy to misread when the supplied prior snapshot was stale or temporarily yellow. ChatGPT could then reason from a yellow comparison state even though the current packet was green.

Baseline selection makes the comparison target explicit.

## Modes

Use an explicit snapshot file:

```bash
personal-ops coordination diff --from /path/to/prior-coordination-snapshot.json
```

Use the newest supplied candidate:

```bash
personal-ops coordination diff --against previous --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
```

Use the newest supplied green candidate:

```bash
personal-ops coordination diff --against last-green --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
```

The same modes are available for ChatGPT packets:

```bash
personal-ops coordination briefing --for chatgpt --against last-green --candidate /path/to/snapshot-a.json --candidate /path/to/snapshot-b.json
```

## Labels

Diffs and briefings include a `Compared against` line.

Examples:

- `Compared against: explicit snapshot from 2026-05-04T06:45:11.157Z`
- `Compared against: latest previous snapshot from 2026-05-04T07:45:11.157Z`
- `Compared against: last trusted green snapshot from 2026-05-04T06:45:11.157Z`

This label tells ChatGPT and Codex which baseline was used before either side reasons about the change set.

## Rules

- `--from` is for `explicit` comparison only.
- `--candidate` is for `previous` and `last-green` selection.
- `previous` chooses the newest supplied candidate by `generated_at`.
- `last-green` chooses the newest supplied candidate where `health.overall` is `green`.
- If no green candidate is supplied for `last-green`, the command fails instead of falling back to yellow.
- Baseline selection never makes the prior snapshot current. The current live snapshot remains the present-state authority.

## What Not To Do Yet

- Do not persist `last_trusted_green` as mutable state.
- Do not auto-discover broad snapshot folders.
- Do not create bridge-db handoff records automatically.
- Do not let ChatGPT choose or bless the baseline.

The operator supplies candidates, Personal Ops selects deterministically, and Codex verifies locally before implementation.
