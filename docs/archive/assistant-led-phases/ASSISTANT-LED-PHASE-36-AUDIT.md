# Assistant-Led Phase 36 Audit

Date: 2026-04-14
Status: Complete

## Audit Result

The prepared-handoff audit found one real contradiction and several aligned surfaces.

The contradiction was not in status or console copy.

It was in assistant-queue precedence:

- once grouped outbound owned the prepared handoff, the queue could still surface generic or upstream review actions for the same work as competing dominant paths

That contradicted the Phase 36 contract because the operator could see more than one top-level review path for one grouped handoff.

## Canonical Owner Decision

The audit confirmed that the service-level `review_approval_flow` projection remains the canonical owner of:

- prepared-handoff target identity
- primary summary
- primary command

Workspace focus, grouped outbound detail, Drafts, Approvals, and console copy already align to that contract once duplicate queue paths are removed.

## Audit Matrix

| surface | owner type | target identity | summary | command story | relationship to canonical | operator value | decision | reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| workspace focus | canonical | active `outbound_autopilot_group` when prepared handoff is live | mirrors `review_approval_flow.summary` | mirrors grouped outbound command when top assistant action matches flow | aligned | necessary | keep | already points to the prepared handoff once duplicate assistant queue actions stop winning |
| top assistant guidance | supportive | previously mixed between grouped outbound, generic top attention, and upstream draft-group review for the same work | could duplicate grouped handoff narrative | could present a second dominant review path | contradictory | harmful | rewrite | suppress duplicate generic and upstream queue actions once grouped outbound owns the same handoff |
| Drafts | referential | current grouped outbound | explains that grouped handoff owns review / approval / send path | points operator into grouped outbound detail | aligned | useful | keep | already expresses the grouped handoff as the forward path |
| Outbound Finish-Work | canonical | current grouped outbound | primary grouped review / approval / send summary | primary grouped outbound command path | aligned | necessary | keep | this is the correct canonical execution surface |
| Approvals | referential | approval item within current grouped outbound | explains approval belongs to grouped handoff | uses grouped approval path first | aligned | useful | keep | already reinforces the grouped approval path without claiming separate authority |
| console Overview | supportive | current grouped outbound when top assistant action targets it | supporting guidance rather than a second approval path | overview card points into grouped handoff | aligned | useful | keep | existing overview copy was already correct once the queue top action was canonical |
| console section-level handoff copy | referential | current grouped outbound | Drafts and Approvals sections reinforce grouped path | section detail points back to grouped outbound flow | aligned | useful | keep | no wording churn justified |

## Cleanup Decision

Visible cleanup was justified only in assistant queue composition.

Phase 36 therefore shipped one bounded presentation cleanup:

- suppress generic `assistant.review-top-attention` when it would duplicate the same grouped outbound handoff
- suppress the upstream inbox draft-group assistant action for the same group once grouped outbound owns the prepared handoff
- suppress generic draft and approval review actions for items already covered by grouped outbound

No broader console, status, route, auth, lifecycle, or transport changes were justified.

## Boundaries Preserved

The audit did **not** require changes to:

- `pickFlowCandidate`
- review / approval / send lifecycle semantics
- grouped outbound lifecycle semantics
- calibration heuristics
- schema or persistence
- auth, origin, session, route, or browser-safe boundaries
- console asset exposure
- browser-visible payload shape

## Verification Targets

The audit required proof in two layers:

- deterministic service coverage for grouped-handoff precedence and duplicate suppression
- console coverage for Overview, Drafts, and Approvals agreement in one grouped-handoff state

No new browser authority or broad verifier expansion was justified.
