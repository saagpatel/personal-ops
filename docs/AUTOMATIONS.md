# AUTOMATIONS

This document is the operator runbook for the post-launch recurring automation layer.

The automation layer is still conservative. Most automations remain read-first. The only allowed unattended mutations are local recovery snapshot create and local snapshot prune when the health gate is already `ready`.

## Active personal-ops automations

All five automations use this workspace:

- `/Users/d/.local/share/personal-ops`

### Morning Brief

- Automation id: `personal-ops-morning-brief`
- Purpose: start the workday with the shortest useful operator briefing
- Schedule: every weekday at 8:30 AM America/Los_Angeles
- Commands used:
  - `personal-ops workflow now-next --json`
  - `personal-ops workflow prep-day --json`
- Output shape:
  - `Overall State`
  - `Top Attention`
  - `Time-Sensitive Items`
  - `Next Commands`
- Notes:
  - uses `workflow now-next` for the lead recommendation
  - uses `workflow prep-day` for the broader day-start picture

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
- Notes:
  - surfaces prune pressure
  - surfaces recovery rehearsal staleness
  - remains read-first

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

### End-of-Day Recovery Snapshot

- Automation id: `personal-ops-end-of-day-recovery-snapshot`
- Purpose: capture one fresh weekday recovery point and apply retention when health is already safe
- Schedule: every weekday at 6:15 PM America/Los_Angeles
- Commands used:
  - `personal-ops health check --json`
  - `personal-ops backup create --json`
  - `personal-ops backup prune --yes --json`
- Output shape:
  - `Health State`
  - `Snapshot Action`
  - `Retention Result`
  - `Next Repair Step`
- Mutation rule:
  - if health is not `ready`, do not mutate and open a repair-oriented inbox item instead
  - if health is `ready`, mutation is limited to local snapshot create and local snapshot prune

### Weekly Recovery Rehearsal Reminder

- Automation id: `personal-ops-weekly-recovery-rehearsal-reminder`
- Purpose: keep restore confidence from going stale
- Schedule: every Monday at 9:15 AM America/Los_Angeles
- Commands used:
  - `personal-ops health check --json`
- Output shape:
  - `Recovery Confidence`
  - `Last Rehearsal`
  - `Run This Week`
- Reminder rule:
  - when rehearsal is stale or missing, lead with `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`

## Guardrails

These automations must remain conservative:

- no send
- no restore
- no approval actions
- no auth mutation
- no silent state changes
- no background task mutation
- no background calendar mutation
- no background browser action
- only `End-of-Day Recovery Snapshot` may mutate, and only for local snapshot create/prune after a `ready` health gate

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

- These automations are meant to support the daily loop around `personal-ops workflow prep-day`, `personal-ops workflow now-next`, `personal-ops worklist`, and `personal-ops health check`.
- The recurring reliability layer now centers on `personal-ops health check`, `personal-ops backup prune`, and `npm run verify:recovery`.
- If one starts producing noisy output, tighten the prompt before adding more automations.
- If the system ever needs mutation-capable automation, treat that as a new roadmap phase instead of extending these prompts casually.
