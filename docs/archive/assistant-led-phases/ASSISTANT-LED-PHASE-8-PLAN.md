# Assistant-Led Phase 8 Plan

## Title

Continuous Autopilot, Warm Start, and Value Review

## Goal

Make `personal-ops` feel prepared before the operator opens it by introducing one continuous autopilot coordinator that warms the existing assistant-led workspace surfaces in the background.

## Delivered Scope

Phase 8 adds:

- a single autopilot coordinator over day-start, inbox, meetings, planning, and outbound prep
- stale-while-refresh freshness tracking plus per-profile profile state
- operator CLI and HTTP autopilot status and manual-run surfaces
- warm-open status for the console and desktop shell
- additive provenance for autopilot-prepared drafts and meeting packets
- additive status reporting and desktop snapshot fields for autopilot freshness
- usefulness instrumentation through autopilot run and profile-state persistence

## Guardrails

Phase 8 keeps trust boundaries unchanged:

- no auto-request-approval
- no auto-approve
- no auto-send
- no browser-side send-window control
- no auth mutation
- no restore
- no destructive delete widening

Autopilot is allowed to prepare safe work, but it does not decide high-trust actions.

## Operator Path

The main new operator commands are:

```bash
personal-ops autopilot status
personal-ops autopilot status --json
personal-ops autopilot run
personal-ops autopilot run --profile inbox
personal-ops autopilot run --profile meetings
```

The console and desktop shell now consume the same freshness state through `GET /v1/autopilot/status`.

## Acceptance Target

Phase 8 is successful when:

- the existing assistant-led surfaces can be warmed from one coordinator instead of fragmented background prep
- the console and desktop shell open into a visibly warm workspace when safe
- stale profiles are refreshed without widening browser-safe mutation scope
- autopilot runs are observable through status, run history, and profile freshness state
- the rollout doc can clearly review Phases 1 through 8 and explain whether operator effort was materially reduced
