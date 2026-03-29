# Assistant-Led Phase 7 Rollout

## Summary

Assistant-Led Phase 7 adds approval autopilot and outbound finish-work.

The product now supports:

- `personal-ops outbound autopilot`
- grouped outbound detail, request-approval, approve, and send flows
- console-first outbound finish-work in Overview, Drafts, and Approvals
- singleton outbound fallback for approval items that are not tied to a current inbox autopilot group
- explicit send-window blocked state with CLI handoff guidance

## Trust Boundary

This phase moves the final outbound workflow into the console without widening high-trust autonomy.

It adds:

- browser-safe grouped request-approval
- browser-safe grouped approve
- browser-safe grouped send
- browser-safe approval reject, reopen, and cancel recovery actions

It does not add:

- silent approval
- silent send
- browser-side send-window enablement
- auth mutation
- restore
- destructive delete widening

Important outbound rules:

- grouped approve and grouped send remain operator-only
- grouped approve and grouped send require explicit confirmation plus a note
- send still depends on CLI-managed send-window state
- all grouped outbound actions are audit-logged

## Verification

Required verification passed:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:desktop`
- `npm run verify:all`

Observed results during closeout:

- `176` tests passing
- focused Phase 7 browser and service tests passed after stabilizing outbound-group reconstruction through draft provenance
- full verification remained green after the broader gate

Targeted coverage now includes:

- grouped outbound formation from reviewed inbox autopilot work and orphan approvals
- grouped request-approval creation without duplicate approvals
- grouped approve and grouped send note and confirmation requirements
- sequential stop-on-first-failure behavior for grouped outbound actions
- send-window blocked state with CLI handoff
- browser-safe outbound routes plus approval recovery actions
- workflow preference for grouped outbound finish-work when the system is healthy

## Operator Notes

Outbound finish-work is now the preferred path once inbox autopilot drafts have been reviewed.

Use:

```bash
personal-ops outbound autopilot
personal-ops outbound autopilot --group <groupId>
personal-ops outbound autopilot --group <groupId> --request-approval --note "<reason>"
personal-ops outbound autopilot --group <groupId> --approve --note "<reason>"
personal-ops outbound autopilot --group <groupId> --send --note "<reason>"
```

The console Drafts section now leads with grouped outbound work:

- reviewed groups with no approval request show `Request approval`
- pending approval groups show `Approve group`
- approved groups with an active send window show `Send group`
- blocked groups show send-window status plus the exact CLI handoff

The Approvals section remains the recovery surface for:

- reject
- reopen
- cancel

Send-window control still stays in the CLI, for example:

```bash
personal-ops send-window enable --reason "<reason>"
```

## Live Sanity

Completed live checks:

- `personal-ops install all --json`
- `personal-ops outbound autopilot`
- `personal-ops outbound autopilot --json`
- `personal-ops outbound autopilot --group <groupId>`
- `personal-ops workflow now-next`
- `personal-ops workflow prep-day`
- `personal-ops workflow follow-up-block`
- `personal-ops console --print-url`
- in-browser request approval for a reviewed outbound group
- in-browser approve of that group with confirmation
- CLI send-window enablement
- in-browser grouped send with confirmation
- browser-session rejection of send-window mutation routes with `403`

Live validation notes:

- the grouped outbound layer now rebuilds from assistant draft provenance, so the same outbound group stays visible after approval state changes
- for safety, the end-to-end send proof used a temporary self-addressed reviewed draft group
- that temporary group was approved, sent, and then cleaned up after verification
- send-window state remained CLI-controlled throughout the live pass
- approval and send never happened automatically
