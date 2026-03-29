# Post-Launch Phase 1 Handoff

## Title

Automation and Daily Briefings

## Why This Is Next

`personal-ops` is now stable, verified, documented, and productized. The next highest-leverage improvement is to make it more proactively useful in the operator’s day-to-day workflow.

The system already has the core ingredients:

- `personal-ops now`
- `personal-ops worklist`
- `personal-ops health check`
- snapshot creation and freshness checks
- operator-safe status, doctor, and planning reads

The next step is to turn those into recurring operator-facing loops.

## Suggested Starting Scope

Start with three automations:

1. Morning briefing
2. Health and snapshot freshness check
3. End-of-day wrap-up

That gives immediate value without widening permissions or creating risky background mutation behavior.

## Morning Briefing

Purpose:

- summarize current readiness
- surface the top worklist item
- call out urgent inbox, planning, or task pressure
- point to the next best operator action

Inputs to reuse:

- `personal-ops now`
- `personal-ops status --json`
- `personal-ops worklist --json`

## Health and Snapshot Check

Purpose:

- detect local drift early
- warn when snapshots are stale
- surface when the daemon or local install needs attention

Inputs to reuse:

- `personal-ops health check`
- `personal-ops health check --deep --json`

## End-of-Day Wrap-Up

Purpose:

- summarize what remains open
- surface overdue or likely-next items
- suggest what should be carried into tomorrow

Inputs to reuse:

- `personal-ops worklist`
- task and planning reads

## Guardrails

- no background send actions
- no background restore actions
- no background approval actions
- no background auth flows
- no silent mutating behavior unless a later phase explicitly approves it

## Success Criteria

Phase 1 is successful when:

- the operator has a small set of dependable recurring automations
- the automations are useful without requiring manual babysitting
- the automations stay within current trust boundaries
- the existing verification stack still passes cleanly

## Preserve Across Compaction

- this is the next recommended implementation phase
- keep the first automation phase read-first and operator-safe
- prioritize daily rhythm and drift detection before deeper browser actions or new integrations
