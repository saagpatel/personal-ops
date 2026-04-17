# Assistant-Led Phase 34 Rollout

## Intent

Phase 34 is the assistant-led review surface adjustment proof phase, not a reopening of the older legacy `PHASE-*` track.

The goal is to make exactly one more review/approval surface change only when the new Phase 33 calibration evidence proves that the same decision-surface gap is repeating often enough to justify it.

The phase keeps the same boundaries:

- no new handoff selection logic
- no lifecycle or storage changes
- no new commands, HTTP routes, or MCP tools
- no browser authority expansion

## What shipped

Phase 34 adds one bounded presentation layer on top of the existing `ReviewApprovalFlowSummary`.

That layer now:

- keeps the status-style handoff composition as the canonical narrative owner
- applies one explicit proof gate before promoting any secondary handoff explanation
- promotes exactly one secondary explanation from `supporting_summary` when the proof gate is met
- keeps calibration explanatory and secondary in both the CLI/status and browser console surfaces
- removes the redundant generic console focus note when the stronger proof-gated explanation is available

## Entry-gate contract

The visible Phase 34 adjustment only applies when all of the following are true for the current primary handoff:

- `calibration.eligible === true`
- `calibration.status === "attention_needed"`
- `calibration.recommendation_kind === "consider_decision_surface_adjustment"`
- `supporting_summary` is present
- `sample_count_14d >= 4`

When that gate is not met, the correct Phase 34 behavior remains:

- no visible handoff adjustment

## Console-safe implementation detail

The browser console now imports a small shared review/approval presentation module.

To keep that browser path working without widening console permissions broadly, the daemon serves only the narrow extra root-level console module that the browser module graph now needs.

That means Phase 34 fixed a real console startup regression while still keeping the console asset boundary intentionally tight.

## Scenarios

### 1. Proof gate stays closed

When review/approval calibration is missing, weak, or points somewhere other than decision-surface adjustment:

- status keeps the Phase 33-equivalent handoff story
- console keeps the primary handoff summary without promoting `supporting_summary`
- calibration remains additive and secondary

### 2. Proof gate opens

When repeated recent handoff outcomes show an `attention_needed` decision-surface pattern with enough evidence:

- status promotes one supporting explanation from the existing `supporting_summary`
- console promotes that same supporting explanation
- both surfaces keep the same primary handoff and command precedence
- calibration still explains the evidence instead of becoming the main instruction

### 3. Grouped outbound remains primary

When grouped outbound already owns the finish-work path:

- the grouped handoff remains structurally primary
- Phase 34 does not reopen review or approval ranking
- the secondary explanation only clarifies the current handoff instead of changing it

## Verification

Phase 34 adds deterministic coverage for:

- proof-gate true and false behavior
- proof-triggered promotion of exactly one secondary explanation
- status and console alignment on the same primary handoff
- MCP review/approval seams staying bounded and confirmation-token based
- daemon serving the exact browser console module graph needed by the new shared presenter

Local verification for the phase includes:

- `npm run typecheck`
- `npm test`
- `npm run verify:console`
- `npm run verify:all`

## Workflow hardening decision

Phase 34 strengthened deterministic `npm test` seam coverage enough that no new CI or release workflow gate was required for this slice.

That means:

- `release:check:ci` remains unchanged
- `app/test/hardening.test.ts` did not need an update
- the enforcement gain came from better direct seam coverage instead of more workflow surface area

## Guardrail proof

Phase 34 does not add:

- new user-facing commands
- new HTTP routes for product actions
- new MCP tools
- new queue kinds or persistence
- new review, approval, or send authority
- new lifecycle semantics for grouped outbound, review, or approval work

This is still a bounded presentation-proof phase.

## Next step

The intended next assistant-led target after this phase is:

- **Assistant-Led Phase 35: Review Surface Stability Check**

Phase 35 should only proceed if the newly proof-gated presentation is worth validating as a stable default rather than another one-off wording change.
