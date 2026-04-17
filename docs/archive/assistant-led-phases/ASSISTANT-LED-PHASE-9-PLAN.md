# Assistant-Led Phase 9 Plan

## Title

Review Intelligence 2.0

## Goal

Make review work smaller, safer, and more learnable by adding a derived review overlay that compresses prepared work into bounded packages, accepts operator feedback, and proposes review-only tuning without changing the core workflow ranking engine.

## Delivered Scope

Phase 9 adds:

- one bounded review package per surface for inbox, meetings, planning, and outbound work
- stable review package fingerprints based on source identity and underlying state instead of presentation copy
- a persisted review read model with freshness tracking and single-flight refresh behavior
- additive read-only CLI and HTTP surfaces for review packages and tuning proposals
- operator-only review package feedback with optional item-level targeting
- audit-safe review tuning proposal approvals and dismissals that preserve evidence snapshots
- console review overlay cards and browser-safe review actions without hiding the raw worklist
- desktop review package and tuning notification signals with bounded cooldown policy

## Guardrails

Phase 9 keeps trust boundaries unchanged:

- review packages remain a derived overlay, not a new core workflow source
- the raw worklist stays visible and unfiltered by review package existence
- feedback and tuning actions stay operator-only and note-required
- tuning effects are limited to review overlay suppression, ordering, and notification cooldowns
- no change to approval, send, auth, restore, or other high-trust mutation boundaries

## Architecture

The main design choices are:

- derive review state from existing prepared surfaces instead of injecting review items into workflow ranking
- persist the derived review read model so reads can serve stored state while background refresh is in flight
- keep package identities stable across harmless title, summary, and command-copy edits
- preserve proposal evidence separately from decision metadata and runtime tuning state
- let item-level feedback shape future tuning proposals without forcing package-wide sentiment

## Operator Path

The main new operator commands are:

```bash
personal-ops review packages
personal-ops review package <packageId>
personal-ops review package <packageId> feedback --reason <reason> --note "<text>"
personal-ops review package <packageId> feedback --reason <reason> --note "<text>" --item <packageItemId>
personal-ops review tuning
personal-ops review tuning <proposalId> approve --note "<text>"
personal-ops review tuning <proposalId> dismiss --note "<text>"
```

The main new HTTP surfaces are:

- `GET /v1/review/packages`
- `GET /v1/review/packages/:packageId`
- `POST /v1/review/packages/:packageId/feedback`
- `GET /v1/review/tuning`
- `POST /v1/review/tuning/:proposalId/approve`
- `POST /v1/review/tuning/:proposalId/dismiss`
- `GET /v1/review/notifications`

## Acceptance Target

Phase 9 is successful when:

- review packages compress prepared work without changing legacy workflow ranking
- stored review reads remain consistent while refresh is in flight
- item-level feedback only affects the targeted review item
- tuning approvals preserve original evidence and only change overlay behavior
- the console and desktop shell expose the review overlay without widening trust boundaries
- the rollout doc can show that review load and notification noise became smaller in practice while core ranking stayed unchanged
