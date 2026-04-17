# Assistant-Led Phase 9 Rollout

## Summary

Assistant-Led Phase 9 adds a real review intelligence layer on top of the existing assistant-led workspace.

The product now supports:

- bounded review packages across inbox, meetings, planning, and outbound surfaces
- stable review package identity that survives presentation-only copy changes
- persisted review read-model freshness with single-flight refresh behavior
- operator-only package and item-level review feedback
- operator-only review tuning approvals and dismissals with preserved evidence snapshots
- browser-safe review package and tuning reads for the console and desktop shell
- console review overlay actions that do not hide the raw worklist
- desktop review package and tuning notifications with review-specific cooldown policy

## What Phase 9 Adds

Phase 9 is intentionally an overlay phase, not a new ranking engine.

It adds:

- one derived review package per prepared surface instead of a second raw queue
- feedback events that can target the whole package or one package item
- tuning proposals derived from repeated negative feedback and stale unused review work
- runtime tuning state that can suppress low-value review sources, lower review surface priority, and cool down review notifications

It does not add:

- a new source inside the core workflow ranking engine
- implicit hiding of raw worklist items because a review package exists
- automatic approval, automatic send, auth mutation, restore widening, or browser-side send-window control

## Trust Boundary

Phase 9 keeps the operator trust boundary explicit:

- review packages are derived from existing prepared work and stay additive
- review mutation routes stay operator-only and note-required
- tuning decisions only affect the review overlay and review notifications
- core worklist, day-start, and workflow ranking logic remain driven by the original sources

## Verification

Required verification passed during closeout:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Closeout verification was rerun to completion on April 7, 2026 after repairing a missing local Playwright browser install that affected the console gate. The rerun completed cleanly and confirmed the Phase 9 changes were not the source of that failure.

Observed application test result:

- `185` tests passing

Targeted Phase 9 coverage now includes:

- one active package per surface with a max of three items per package
- stable package identity across summary and copy changes
- single-flight refresh with stored reads served during refresh
- item-level feedback isolation
- review package overlay parity with the legacy worklist
- evidence-preserving tuning approval behavior
- desktop notification policy for review package and tuning signals

## Operator Notes

Use:

```bash
personal-ops review packages
personal-ops review package <packageId>
personal-ops review package <packageId> feedback --reason <reason> --note "<text>"
personal-ops review package <packageId> feedback --reason <reason> --note "<text>" --item <packageItemId>
personal-ops review tuning
personal-ops review tuning <proposalId> approve --note "<text>"
personal-ops review tuning <proposalId> dismiss --note "<text>"
```

What changes in practice:

- the console now shows review packages as a separate overlay instead of pushing them into the main raw queue
- the desktop shell can notify on review package and tuning changes without reusing only the older inbox/planning cues
- operator feedback can now teach the review overlay at package or item granularity

High-trust actions remain explicit:

- review feedback and tuning decisions require operator notes
- approval and send still require explicit operator action
- send-window control remains CLI-only

## Completed Work Review

Phases 1 through 8 already delivered:

- assistant queue orchestration
- inbox autopilot grouping
- meeting prep packets
- desktop shell scaffolding
- related-file and Drive context
- planning autopilot bundles
- grouped outbound finish-work
- one continuous autopilot coordinator and warm-start freshness

Phase 9 adds:

- a derived review overlay over those prepared surfaces
- a learnable feedback loop for review quality
- audit-safe tuning proposals and decisions
- review-aware desktop and console operator experiences

Program-level result:

- review work is smaller because prepared items can be consumed as bounded packages
- review learning is more precise because one bad item no longer has to poison a whole package
- notification noise is more governable because review timing and suppression are now separately tunable
- trust boundaries remain unchanged because review intelligence never becomes a new core ranking source

Evidence and outcome review to keep current after final closeout:

- package counts and acted-on rates by surface
- unused-stale rate before and after tuning
- proposal approve and dismiss mix
- per-surface notification volume
- legacy ranking guard outcomes
- remaining operator-visible tradeoffs and deliberate deferrals

## Live Sanity

Completed local sanity checks for this phase should include:

- `personal-ops review packages`
- `personal-ops review package <packageId>`
- `personal-ops review tuning`
- review feedback through CLI and console
- review tuning decisions through CLI and console
- desktop snapshot and notification checks after review package and tuning changes

Live validation notes:

- the raw worklist remains visible even when review packages exist
- review package feedback and tuning decisions stay operator-only
- approved tuning changes the review overlay and notification behavior without widening core workflow authority
