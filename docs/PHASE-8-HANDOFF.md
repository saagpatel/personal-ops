# Phase 8 Handoff

Date: 2026-03-24
Purpose: Starter context for a fresh chat focused on Phase 8

Historical note:

- this file captures the pre-implementation Phase 8 starting point
- Phase 8 is now implemented in code
- use `/Users/d/.local/share/personal-ops/README.md` and `/Users/d/.local/share/personal-ops/CLIENTS.md` for the current shared surfaces and boundaries

## Read This First

For the full record, start with:

- `/Users/d/.local/share/personal-ops/docs/2026-03-24-system-audit.md`

This handoff is the short operational version.

## What `personal-ops` Is

`personal-ops` is the shared machine-level control plane for:

- mail drafts and approval-gated send
- inbox awareness
- worklist and reminders
- tasks and task suggestions
- Google Calendar awareness
- operator-controlled calendar events
- task-to-calendar scheduling
- shared assistant access for Codex and Claude

It is intentionally assistant-neutral.

## Current Verified State

At the time of this handoff:

- tests pass: `34/34`
- deep doctor: `ready`
- schema version: `8`
- send remains disabled by policy
- inbox sync: `ready`
- calendar sync: `ready`
- Google Calendar write scope: healthy
- owned writable calendars: available
- assistant boundaries: intact

## Architectural Rules

Treat these as hard constraints:

1. `personal-ops` is the source of truth
2. assistants are clients, not provider owners
3. read paths should stay non-mutating
4. dangerous actions stay operator-gated
5. assistant-side behavior should remain suggestion-first where appropriate
6. do not create parallel Gmail or Calendar workflows outside `personal-ops`

## What Exists By Phase

### Phase 1 to 2.6

- daemon
- Gmail draft flow
- review queue
- approval queue
- send gating
- status/doctor/snapshots
- timed send windows
- non-mutating health and runtime normalization

### Phase 3 to 4

- inbox metadata sync
- thread-state derivation
- inbox-aware worklist
- Codex and Claude parity through a shared client contract
- MCP assistant identity attribution

### Phase 5

- internal tasks
- assistant-safe task suggestions
- task-aware worklist and reminders

### Phase 6

- Google Calendar metadata sync
- local source and event indexing
- calendar-aware worklist and read surfaces

### Phase 7

- operator-only calendar event create/update/cancel
- task-to-calendar scheduling
- scheduling-aware worklist signals
- write readiness in status and doctor

## Most Important Existing Docs

- `/Users/d/.local/share/personal-ops/README.md`
- `/Users/d/.local/share/personal-ops/CLIENTS.md`
- `/Users/d/.local/share/personal-ops/docs/2026-03-24-system-audit.md`

## Most Important Existing Code

- `/Users/d/.local/share/personal-ops/app/src/service.ts`
- `/Users/d/.local/share/personal-ops/app/src/db.ts`
- `/Users/d/.local/share/personal-ops/app/src/calendar.ts`
- `/Users/d/.local/share/personal-ops/app/src/auth.ts`
- `/Users/d/.local/share/personal-ops/app/src/http.ts`
- `/Users/d/.local/share/personal-ops/app/src/cli.ts`
- `/Users/d/.local/share/personal-ops/app/src/mcp-server.ts`
- `/Users/d/.local/share/personal-ops/app/src/mcp-identity.ts`
- `/Users/d/.local/share/personal-ops/app/src/types.ts`

## Recommended Phase 8 Direction

Phase 8 should be:

- assistant-guided scheduling
- cross-domain planning
- suggestion-first coordination

In practical terms, that likely means:

- assistants suggest scheduling actions instead of mutating calendar directly
- assistants connect tasks, inbox threads, and calendar availability
- worklist gets smarter about prep, follow-up, and unscheduled urgent work
- operators remain the ones who commit actual scheduling changes

## Good Phase 8 Questions

The next chat should answer:

1. What scheduling suggestions should assistants be allowed to create?
2. How should suggestions relate to tasks, inbox threads, and calendar slots?
3. What new suggestion queues or approval flows are needed?
4. Which new worklist items would create real value without adding noise?
5. What remains operator-only?

## Important Non-Goals For Phase 8

Unless a new plan explicitly changes them, assume these stay out:

- direct assistant calendar writes
- guest invites and attendee workflows
- Meet link creation
- recurring event writes
- focus time / out of office / working location writes
- direct provider fallback outside `personal-ops`

## Starting Position For The Next Chat

Assume:

- the foundations are working
- the next phase should build behavior, not rebuild infrastructure
- new work should extend the shared control plane rather than bypass it

The next chat should heavily reference the full audit file and use it as the baseline source of truth.
