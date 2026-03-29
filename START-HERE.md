# START HERE

This is the main entry point for understanding and operating `personal-ops`.

If you only read one document after `README.md`, read this one.

## What this project is

`personal-ops` is a local control layer for personal workflow.

It gives one machine-owned source of truth for:

- inbox and mailbox awareness
- calendar context
- tasks and task suggestions
- planning recommendations
- drafts, approvals, and reviews
- assistant-safe operational reads

The trust model stays simple:

- assistants can help
- the operator stays in charge

## Pick your path

### Operator path

Read in this order:

1. [QUICK-GUIDE.md](QUICK-GUIDE.md)
2. [OPERATIONS.md](OPERATIONS.md)
3. [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
4. [ARCHITECTURE.md](ARCHITECTURE.md)

Use this path if you want to:

- install or move the system to another Mac
- run the daemon and wrappers
- authenticate Gmail and Google Calendar
- use the daily CLI commands
- recover from local setup or runtime problems

### Assistant and contributor path

Read in this order:

1. [QUICK-GUIDE.md](QUICK-GUIDE.md)
2. [CLIENTS.md](CLIENTS.md)
3. [ARCHITECTURE.md](ARCHITECTURE.md)
4. [OPERATIONS.md](OPERATIONS.md)

Use this path if you want to:

- understand the safe shared read model
- understand operator-only boundaries
- contribute safely to the repo
- see where future work should land

## Main docs map

- [OPERATIONS.md](OPERATIONS.md)
  The practical runbook for install, auth, wrappers, LaunchAgent, backup, restore, verification, and troubleshooting.
- [ARCHITECTURE.md](ARCHITECTURE.md)
  The current system shape after Phases 1 to 4, including trust boundaries and module layout.
- [QUICK-GUIDE.md](QUICK-GUIDE.md)
  The shortest role-based onboarding path for a new operator or a new assistant.
- [CLIENTS.md](CLIENTS.md)
  The shared client contract for assistants and MCP consumers.

## History and deep context

These docs are still important, but they are history and deeper context, not the main onboarding path:

- [docs/IMPROVEMENT-ROADMAP.md](docs/IMPROVEMENT-ROADMAP.md)
  The active post-program roadmap and current phase memory.
- [docs/PROGRAM-COMPLETE-SUMMARY.md](docs/PROGRAM-COMPLETE-SUMMARY.md)
  The summary of the earlier Phase 1 to 33 program.
- [docs/2026-03-24-system-audit.md](docs/2026-03-24-system-audit.md)
  The deep system audit and prior live verification record.
- [docs/PHASE-1-ROLLOUT.md](docs/PHASE-1-ROLLOUT.md)
  Install and productization rollout.
- [docs/PHASE-2-ROLLOUT.md](docs/PHASE-2-ROLLOUT.md)
  Refactor and roadmap-memory rollout.
- [docs/PHASE-3-ROLLOUT.md](docs/PHASE-3-ROLLOUT.md)
  End-to-end verification rollout.
- [docs/PHASE-4-ROLLOUT.md](docs/PHASE-4-ROLLOUT.md)
  Daily operator experience rollout.

## Recommended first moves

If you are a new operator:

1. Read [QUICK-GUIDE.md](QUICK-GUIDE.md).
2. Follow [OPERATIONS.md](OPERATIONS.md) for the daily command surface.
3. Use [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md) when setting up another Mac.

If you are a new assistant or contributor:

1. Read [QUICK-GUIDE.md](QUICK-GUIDE.md).
2. Read [CLIENTS.md](CLIENTS.md) before touching provider logic or suggesting assistant workflows.
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) before making structural changes.
