# Assistant-Led Phase 2 Plan

## Summary

Phase 2 makes inbox and follow-up work the first place where `personal-ops` clearly does more of the labor for the operator.

The goal is not automatic send. The goal is grouped draft preparation, grouped review, and a console-first approval handoff.

## Deliverables

- grouped inbox autopilot report
- console-first reply and follow-up blocks
- safe prepare action for grouped draft staging
- assistant-generated draft provenance for reuse and refresh
- browser-safe review open, review resolve, and approval request handoff
- workflow upgrades that prefer staged inbox work over raw thread inspection
- durable Phase 2 docs and roadmap memory

## Public Additions

CLI:

- `personal-ops inbox autopilot`

HTTP:

- `GET /v1/inbox/autopilot`
- `POST /v1/inbox/autopilot/groups/:groupId/prepare`

Console:

- Overview inbox autopilot card
- grouped draft review in Drafts
- autopilot-linked mail-thread detail in Worklist
- approval handoff from prepared drafts without browser send

## Group Model

Autopilot groups are bounded:

- up to 3 threads per group
- up to 2 groups per kind
- kinds:
  - `needs_reply`
  - `waiting_to_nudge`

Group states reuse the assistant queue lifecycle:

- `proposed`
- `running`
- `awaiting_review`
- `blocked`
- `completed`
- `failed`

## Draft Guardrails

- drafts are prepared from existing thread context only
- no automatic send
- no new CC or BCC recipients
- no invented links, promises, attachments, or dates
- unchanged threads reuse existing assistant-generated drafts
- newer inbound mail refreshes the existing draft instead of duplicating it

## Browser Scope

Phase 2 widens browser-safe actions only for:

- grouped draft preparation
- draft create and draft update
- review open and review resolve
- request approval from a prepared draft

Still gated outside browser execution:

- send
- approval approve, reject, and send
- restore
- auth mutation
- destructive delete flows

## Verification

Phase 2 keeps the standard verification stack:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`

Additional focus:

- bounded autopilot grouping
- draft reuse and refresh
- grouped inbox assistant queue actions
- browser-safe draft prep, review handling, and approval handoff
- unchanged send and approval decision guardrails
