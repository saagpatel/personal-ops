# Assistant-Led Phase 17 Plan

## Title

Preventive Maintenance and Drift Reduction

## Summary

Phase 17 turns Phase 16 repair memory into quieter preventive guidance.

This phase adds:

- preventive-maintenance recommendations derived from repeated safe repairs
- shared preventive summaries across status, doctor, health, install check, desktop status, repair plan, and console
- additive repair-run follow-up messaging when the same safe repair keeps repeating

This phase does not add:

- new HTTP routes
- new MCP tools
- browser-side mutation
- background repair or auto-healing

## Delivered Shape

- derive preventive guidance from `repair_executions`, the active repair plan, and existing install/desktop state
- keep preventive maintenance separate from active repair steps
- suppress duplicate preventive guidance when the same issue is already pending
- apply a 24-hour quiet period after a fresh resolved repair so surfaces do not nag immediately
- keep preventive guidance limited to the safe repair families:
  - `install_wrappers`
  - `install_desktop`
  - `install_launchagent`
  - `fix_permissions`

## Acceptance

- recurring safe repairs surface proactive maintenance guidance before the next failure
- active repair steps still lead and are not mixed with preventive hints
- repair run stays CLI-only and only gains additive resolved follow-up messaging
- status, doctor, health, install check, desktop status, and console expose the same preventive summary
- no new trust boundary is widened
