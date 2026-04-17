# Assistant-Led Phase 1 Plan

## Summary

Phase 1 turns the current console into the first assistant-led workspace layer.

The focus is not a desktop shell yet. The focus is making the existing console do more of the operator’s safe daily work.

## Deliverables

- assistant action queue in the console
- assistant queue lifecycle states
- safe one-click assistant actions for low-risk work
- assistant queue CLI reads
- assistant queue HTTP reads and safe run endpoint
- richer assistant-prepared cards in Overview, Worklist, Drafts, Planning, Approvals, and Backups
- full roadmap memory in repo docs

## Public Additions

CLI:

- `personal-ops assistant queue`
- `personal-ops assistant run <actionId>`

HTTP:

- `GET /v1/assistant/actions`
- `POST /v1/assistant/actions/:actionId/run`

Console:

- Overview leads with the assistant queue
- Worklist becomes more action-oriented
- Drafts, Planning, Approvals, and Backups surface assistant-prepared next steps

## Lifecycle States

- `proposed`
- `running`
- `awaiting_review`
- `blocked`
- `completed`
- `failed`

## Phase 1 Safe Actions

Initial safe one-click actions:

- refresh local context
- create a fresh recovery snapshot

Initial review-gated assistant actions:

- review the best next move
- review the next planning recommendation
- review pending approvals
- review prepared drafts

## Guardrails

- no send
- no restore
- no approval decisions
- no auth mutation
- no destructive delete flow
- no broad new browser mutation scope

## Verification

Phase 1 keeps the standard verification stack:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`

Additional focus:

- assistant queue state visibility
- safe action execution
- review-gated action protection
- unchanged browser trust limits
