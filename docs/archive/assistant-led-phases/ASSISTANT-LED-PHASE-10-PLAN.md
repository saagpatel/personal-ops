# Assistant-Led Phase 10 Plan

## Title

Review Outcomes, Eval Loop, and Notification Governance

## Goal

Turn the shipped Phase 9 review overlay into a measurable operator system by tracking real review package lifecycles, notification outcomes, and tuning effectiveness without widening trust boundaries or changing core workflow ranking.

## Delivered Scope

Phase 10 adds:

- review package cycle history so reporting is based on contiguous package lifecycles instead of stable package ids alone
- persisted desktop review notification telemetry for both fired and suppressed review notifications
- a review outcomes report over CLI, HTTP, console, and additive status summaries
- package open, acted-on, stale-unused, and notification-conversion metrics across 7-, 14-, and 30-day windows
- noisy-source reporting that combines feedback and stale-unused signals by surface and source key
- proposal outcome summaries for proposed, approved, dismissed, reopened, and active tuning state counts
- report attribution that can still map legacy feedback rows which predate `package_cycle_id`

## Guardrails

Phase 10 keeps the Phase 9 trust model intact:

- review intelligence remains a derived overlay and never becomes a new workflow ranking source
- report reads are additive and detailed reporting stays operator-only
- no automatic tuning approval or automatic policy mutation
- desktop remains summary-and-notification only; it does not become a second analytics control plane
- no change to approval, send, auth, restore, or other high-trust mutation boundaries

## Architecture

The main design choices are:

- use `review_package_cycles` as the analytics unit instead of raw stable package rows
- record review notification decisions in `review_notification_events`, including cooldown suppressions
- derive report surfaces from existing review packages, cycles, feedback, proposals, tuning state, and notification telemetry
- attribute notification metrics by package cycle or proposal family so the operator can see whether alerts led to action
- keep the report path read-only and additive to the existing review overlay

## Operator Path

The main new operator commands are:

```bash
personal-ops review report
personal-ops review report --days 7
personal-ops review report --days 30 --surface inbox
personal-ops review report --json
```

The main new HTTP surface is:

- `GET /v1/review/report`

The main operator questions this phase answers are:

- are review packages being opened and acted on
- which surfaces or sources stay noisy
- are review notifications helping or mostly being suppressed
- which tuning proposals are proving useful over time

## Acceptance Target

Phase 10 is successful when:

- reporting reflects real package lifecycles instead of package-id churn or overcounting
- notification telemetry captures both fired and suppressed review notifications
- the console, CLI, and HTTP API expose the same review outcomes picture
- legacy review data remains attributable enough to keep reports useful after upgrade
- verification proves the reporting layer stays additive and does not disturb existing ranking behavior
