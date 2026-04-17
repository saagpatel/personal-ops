# Assistant-Led Phase 7 Plan

## Title

Approval Autopilot and Outbound Finish-Work

## Goal

Move the last outbound finish-work step into the console so reviewed mail work can be approved and sent without dropping back to the CLI for ordinary grouped follow-through.

## Delivered Scope

Phase 7 adds:

- grouped outbound reporting through `personal-ops outbound autopilot`
- grouped outbound detail, request-approval, approve, and send routes
- console-first outbound cards in Overview, Drafts, and Approvals
- grouped finish-work over reviewed inbox autopilot groups
- singleton fallback for approval requests that are not part of a current inbox group
- explicit send-window awareness in the grouped outbound UI

## Guardrails

Phase 7 keeps the trust model explicit:

- no silent approval
- no silent send
- no browser-side send-window enablement
- no auth mutation
- no restore
- no destructive delete widening

Grouped request-approval, approve, and send remain:

- operator-only
- note-required
- confirmation-gated for approve and send
- audit-logged

## Operator Path

The main new operator commands are:

```bash
personal-ops outbound autopilot
personal-ops outbound autopilot --group <groupId>
personal-ops outbound autopilot --group <groupId> --request-approval --note "<reason>"
personal-ops outbound autopilot --group <groupId> --approve --note "<reason>"
personal-ops outbound autopilot --group <groupId> --send --note "<reason>"
```

The console now uses the same grouped outbound path for:

- request approval
- grouped approve
- grouped send
- approval recovery detail

Send-window control still stays in the CLI.

## Acceptance Target

Phase 7 is successful when:

- reviewed inbox autopilot groups become stable outbound groups
- the operator can request approval, approve, and send a grouped outbound block from the console
- send-window state is visible in the grouped outbound flow
- grouped send stops cleanly on the first failure and reports partial progress
- approval and send do not happen automatically
