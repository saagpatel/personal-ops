# AUTOMATIONS

This document is the operator runbook for the post-launch recurring automation layer.

The first post-launch automation phase is intentionally read-first. These automations summarize, surface, and remind. They do not send, restore, approve, re-authenticate, or mutate state in the background.

## Active personal-ops automations

All three automations use this workspace:

- `/Users/d/.local/share/personal-ops`

### Morning Brief

- Automation id: `personal-ops-morning-brief`
- Purpose: start the workday with the shortest useful operator briefing
- Schedule: every weekday at 8:30 AM America/Los_Angeles
- Commands used:
  - `personal-ops now --json`
  - `personal-ops status --json`
  - `personal-ops worklist --json`
- Output shape:
  - `Overall State`
  - `Top Attention`
  - `Time-Sensitive Items`
  - `Next Commands`

### Midday Health Guard

- Automation id: `personal-ops-midday-health-guard`
- Purpose: catch runtime drift, stale backups, or recovery issues before the day ends
- Schedule: every weekday at 1:00 PM America/Los_Angeles
- Commands used:
  - `personal-ops health check --deep --json`
- Output shape:
  - `Health State`
  - `Snapshot Freshness`
  - `First Repair Step`

### End-of-Day Wrap-Up

- Automation id: `personal-ops-end-of-day-wrap-up`
- Purpose: summarize what remains open and what should carry into the next day
- Schedule: every weekday at 5:30 PM America/Los_Angeles
- Commands used:
  - `personal-ops worklist --json`
  - `personal-ops status --json`
- Output shape:
  - `What’s Still Open`
  - `Carry Forward`
  - `Tomorrow’s First Move`

## Guardrails

These automations must remain read-first:

- no send
- no restore
- no approval actions
- no auth mutation
- no silent state changes
- no background task mutation
- no background calendar mutation

If a later phase adds higher-trust automation behavior, it should be a separate explicit phase with new guardrails and verification.

## Pause, update, or recreate

Automation setup files live under:

- `/Users/d/.codex/automations/<automation-id>/automation.toml`

The scheduler registry lives in:

- `/Users/d/.codex/sqlite/codex-dev.db`

Common maintenance paths:

1. Pause or update an automation
- edit its `automation.toml`
- then run:

```bash
/Users/d/.codex/codexkit/scripts/audit/reconcile_automations_apply.sh
```

2. Recreate the automation set from the repo docs
- restore or recreate the folders under `/Users/d/.codex/automations/`
- use the ids, prompts, and schedules in this document
- run the reconcile script above

3. Verify registration
- inspect the TOML files under `/Users/d/.codex/automations/`
- check the sqlite registry row in `/Users/d/.codex/sqlite/codex-dev.db`
- confirm the automation remains `ACTIVE` and has a future `next_run_at`

## Operator notes

- These automations are meant to support the daily loop around `personal-ops now`, `personal-ops worklist`, and `personal-ops health check`.
- If one starts producing noisy output, tighten the prompt before adding more automations.
- If the system ever needs mutation-capable automation, treat that as a new roadmap phase instead of extending these prompts casually.
