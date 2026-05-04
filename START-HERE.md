# START HERE

This is the main entry point for understanding and operating `personal-ops`.

If you only read one document after `README.md`, read this one.

## What this project is

`personal-ops` is a local workflow hub for one person.

It gives you one machine-owned source of truth for:

- inbox and mailbox awareness
- calendar context
- tasks and task suggestions
- planning recommendations
- optional GitHub PR and review context
- optional Google Docs, Google Sheets, and Drive metadata context
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
3. [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md)
4. [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
5. [ARCHITECTURE.md](ARCHITECTURE.md)

Use this path if you want to:

- install or move the system to another Mac
- understand the single-primary-machine model before using backups to migrate state
- use the local operator console for daily visibility plus narrow browser-safe actions
- optionally use the macOS desktop shell for the same console in a native window
- rely on the new continuous autopilot layer to warm those surfaces before opening them
- use inbox autopilot to stage grouped reply and follow-up drafts before asking for approval
- use planning autopilot bundles when the assistant has already staged grouped execution work
- use outbound autopilot when reviewed reply or follow-up work is ready for approval or send
- use the new day-start workflow bundle before dropping into narrower commands
- optionally add narrow GitHub PR and review context
- optionally add narrow Google Docs, Google Sheets, and Drive metadata context
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
  The practical runbook for install, auth, wrappers, LaunchAgent, optional GitHub setup, optional Drive and Docs setup, console access, backup, restore, verification, and troubleshooting.
- [RELEASING.md](RELEASING.md)
  The release and maintenance checklist for the formal local ship gate and recurring health checks.
- [UPGRADING.md](UPGRADING.md)
  The official source-first upgrade path after tagging or changing branches.
- [CHANGELOG.md](CHANGELOG.md)
  The operator-facing release notes for tagged versions.
- [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md)
  The operator automation runbook for the recurring briefing, recovery snapshot, and rehearsal reminder layer.
- [ARCHITECTURE.md](ARCHITECTURE.md)
  The current system shape after the completed assistant-led track through Phase 38, including trust boundaries, module layout, and the console-first local control plane.
- [QUICK-GUIDE.md](QUICK-GUIDE.md)
  The shortest role-based onboarding path for a new operator or a new assistant.
- [CLIENTS.md](CLIENTS.md)
  The shared client contract for assistants and MCP consumers, including the assistant-safe GitHub and Drive read surfaces.
- [docs/CHATGPT-CODEX-HANDOFF.md](docs/CHATGPT-CODEX-HANDOFF.md)
  The draft protocol for using ChatGPT memory and Codex local verification together.
- [docs/CROSS-PROJECT-COORDINATION.md](docs/CROSS-PROJECT-COORDINATION.md)
  The coordination contract for using personal-ops with Notion, GithubRepoAuditor, bridge-db, and notification-hub without creating another source of truth.
- [docs/COORDINATION-SNAPSHOT-SCHEMA.md](docs/COORDINATION-SNAPSHOT-SCHEMA.md)
  The read-only schema and command contract for generating a derived cross-project coordination snapshot.
- [docs/COORDINATION-BRIEFING.md](docs/COORDINATION-BRIEFING.md)
  The read-only Markdown handoff packet generated from the coordination snapshot for Codex-to-ChatGPT loops.
- [docs/ASSISTANT-LED-ROADMAP.md](docs/ASSISTANT-LED-ROADMAP.md)
  The current and future source of truth for the completed assistant-led initiative, now through Phase 38.
- [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md)
  The resume-work checkpoint for the repo after the April 2026 cleanup pass and the merged Operator Home Phase 1 slice.

## History and deep context

These docs are still important, but they are history and deeper context, not the main onboarding path:

- [docs/ASSISTANT-LED-HISTORY-SUMMARY.md](docs/ASSISTANT-LED-HISTORY-SUMMARY.md)
  The durable historical summary of the assistant-led Phases 1 to 38 track.
- [docs/archive/README.md](docs/archive/README.md)
  The archive map for older phase-by-phase plans, rollouts, handoffs, and superseded roadmap material.
- [docs/PROGRAM-COMPLETE-SUMMARY.md](docs/PROGRAM-COMPLETE-SUMMARY.md)
  The historical summary of the earlier Phase 1 to 33 program.
- [docs/2026-03-24-system-audit.md](docs/2026-03-24-system-audit.md)
  The deep system audit and prior live verification record.

## Recommended first moves

If you are a new operator:

1. Read [QUICK-GUIDE.md](QUICK-GUIDE.md).
2. Follow [OPERATIONS.md](OPERATIONS.md), starting with `personal-ops workflow prep-day` for day-start context and `personal-ops workflow now-next` for the immediate next move.
3. Read [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md) if you are resuming work after the April 2026 cleanup pass and want the latest repo checkpoint first.
   It now also captures the post-cleanup Operator Home Phase 1 state on `main`.
4. Use `personal-ops inbox autopilot` or the Drafts section in the console when the assistant has grouped reply or follow-up work ready.
5. Use `personal-ops outbound autopilot` or the Drafts section in the console when reviewed mail work is ready for grouped approval or send.
6. Use `personal-ops planning autopilot` or the Planning section in the console when the assistant has already assembled grouped execution bundles.
7. Use `personal-ops autopilot status` when you want to confirm whether inbox, meeting, planning, outbound, and day-start surfaces are already warm.
8. Use `personal-ops workflow prep-meetings --today` or the `Today's Prep` card in the console when an upcoming meeting needs a staged packet and related Google files.
9. If you want the console to feel more native on macOS, run `personal-ops install desktop` and then `personal-ops desktop open`.
10. Use [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md) when setting up another Mac.
11. If auth or secrets drift, use the recovery notes in [OPERATIONS.md](OPERATIONS.md) before trying ad hoc cleanup.

If you just want the plain-English version:

- `README.md` explains what the project is and why it exists
- this file tells you where to go next
- `QUICK-GUIDE.md` gives the shortest practical setup and daily-use path

If you are a new assistant or contributor:

1. Read [QUICK-GUIDE.md](QUICK-GUIDE.md).
2. Read [CLIENTS.md](CLIENTS.md) before touching provider logic or suggesting assistant workflows.
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) before making structural changes.
