# Assistant-Led Phase 18 Plan

## Title

Maintenance Windows and Preventive Work Bundles

## Summary

Phase 18 turns Phase 17's preventive-maintenance hints into bounded calm-window work.

This phase adds:

- a derived maintenance-window summary on top of repair memory and preventive recommendations
- bounded preventive bundles in `worklist`, `now`, `prep-day`, status-derived payloads, and the console repair area
- deterministic suppression when the system is not ready, active repair is pending, or real operator work is already present

This phase does not add:

- new HTTP routes
- new CLI repair commands
- new SQLite tables
- browser-side mutation or background self-healing

## Delivered Shape

- derive one shared maintenance-window bundle from existing preventive-maintenance recommendations
- only surface that bundle when the system is healthy, no repair steps are pending, and the active queue is calm
- keep maintenance work separate from pending repair steps and from worklist attention items
- add a `Maintenance Window` section to `prep-day` without changing action caps or repair precedence
- keep `now` and `worklist` additive and summary-first

## Acceptance

- calm healthy state can surface a preventive bundle of up to three safe maintenance actions
- concrete work, active repair, system-not-ready state, and fresh quiet-period repairs all suppress the bundle deterministically
- `worklist`, `now`, `prep-day`, status payloads, and console all agree on the same maintenance-window summary
- no new write surface or execution path is introduced
- preventive work never outranks active repair or concrete operator work
