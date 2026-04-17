# Assistant-Led Phase 19 Rollout

## Goal

Ship bounded maintenance sessions on top of the existing calm-window bundle without widening trust boundaries or adding new persistence.

## What Changed

- added a derived `MaintenanceSessionPlan`
- added a derived `MaintenanceSessionRunResult`
- added `personal-ops maintenance session`
- added `personal-ops maintenance run next`
- reused existing safe installer families:
  - `install_wrappers`
  - `install_desktop`
  - `install_launchagent`
  - `fix_permissions`
- reused existing repair history with `trigger_source = "maintenance_run"`

## Expected Operator Outcomes

### Single-step session

- a calm-window bundle with one maintenance recommendation now opens as one session
- `personal-ops maintenance run next` resolves the step
- the session reports completion instead of leaving the operator at a passive reminder

### Multi-step session

- a calm-window bundle with more than one safe step now advances one step at a time
- after a resolved step, the result points back to `personal-ops maintenance run next`

### Repair handoff

- if active repair appears after a maintenance step runs, the session stops
- the operator is handed back to the current repair plan instead of forcing maintenance to continue

## Boundary Proof

- no new HTTP routes were added
- no new MCP tools were added
- no browser execution path was added
- no new SQLite tables were added
- maintenance remains stepwise and CLI-only
