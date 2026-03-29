# Assistant-Led Phase 3 Plan

## Summary

Phase 3 makes upcoming meetings feel pre-assembled before the operator asks.

The goal is not attendee communication. The goal is grounded prep packets with enough context that the operator can review, adjust, and move into the meeting from the console.

## Deliverables

- meeting-prep packet model over the existing calendar workflow surface
- `prep-meetings --event <eventId>` detail and `--prepare` refresh path
- browser-safe packet preparation for one meeting at a time
- assistant queue actions for packet preparation and review-ready meeting prep
- console Overview and Worklist meeting-prep packet views
- durable Phase 3 docs and roadmap memory

## Public Additions

CLI:

- `personal-ops workflow prep-meetings --event <eventId>`
- `personal-ops workflow prep-meetings --event <eventId> --prepare`

HTTP:

- `GET /v1/workflows/prep-meetings/:eventId`
- `POST /v1/workflows/prep-meetings/:eventId/prepare`

Console:

- `Today's Prep` card on Overview
- meeting-packet detail in Worklist
- one-click packet preparation through the existing browser-safe session

## Packet Model

Each packet can include:

- packet summary
- why-now explanation
- grounded agenda draft
- prep checklist
- open questions
- related docs
- related threads
- related tasks
- related recommendations
- exact next commands

Packet states reuse the assistant lifecycle:

- `proposed`
- `running`
- `awaiting_review`
- `blocked`
- `completed`
- `failed`

## Packet Guardrails

- packet selection stays deterministic
- explicit linked docs outrank fallback docs
- no invented attendees, links, dates, or commitments
- low-context meetings return missing-context guidance instead of fabricated detail
- packet preparation is local staging only
- attendee communication and send remain out of scope

## Browser Scope

Phase 3 widens browser-safe actions only for:

- meeting-packet preparation or refresh

Still gated outside browser execution:

- attendee communication or email drafts to attendees
- send
- approval decisions
- restore
- auth mutation
- destructive delete flows

## Verification

Phase 3 keeps the standard verification stack:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`

Additional focus:

- packet candidate selection and weak-meeting suppression
- explicit-docs-first context gathering
- grounded packet generation with low-context fallback
- workflow preference for real meeting prep only when it deserves priority
- browser-safe packet preparation with no broader trust expansion
