# personal-ops

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript)](#) [![Status](https://img.shields.io/badge/status-stable%20local--first-green?style=flat-square)](#)

> A local-first personal workflow hub that helps you review inbox, calendar, planning, drafts, and approvals from one safer place.

`personal-ops` is a private system you run on your own machine. It keeps your work context in one place so you can see what needs attention, review assistant-prepared work, and stay in charge of anything risky like approvals, sends, or destructive changes.

## What This Project Is

If you are brand new, the simplest way to think about `personal-ops` is:

- it is a personal operations dashboard for one person
- it gathers useful work context from tools like Gmail, Google Calendar, Google Drive, and GitHub
- it can prepare drafts, meeting prep, planning bundles, and outbound handoffs for review
- it is designed so assistants can help without getting unlimited account power

This is not a generic chatbot and it is not a cloud service. It is a local workflow system with a local daemon, local state, local verification, and a clear operator-in-charge trust model.

## Why You Would Use It

You would use `personal-ops` if you want:

- one place to see what matters now
- less tab-hopping across email, calendar, docs, and review work
- assistant help with preparation, not silent control over risky actions
- a local system you can inspect, verify, and recover
- the same underlying state available through CLI, browser console, and an optional macOS desktop shell

The core idea stays simple:

- assistants can help
- the operator stays in charge

## What It Is Good At

`personal-ops` is especially useful for:

- inbox and follow-up review
- meeting preparation with related context
- planning the next useful block of work
- staging outbound work until it is ready for approval or send
- keeping a shared, audited source of truth for humans and assistants
- warming up helpful work surfaces before you open them

## How You Use It Day To Day

A beginner-friendly daily flow looks like this:

1. Start the local system and open the console or desktop shell.
2. Check the day-start or now-next guidance to see what matters most.
3. Review prepared work like draft replies, meeting prep, or planning bundles.
4. Approve or send only when you are ready.
5. Use the same local state from the CLI if you want more direct control.

In other words, `personal-ops` is trying to reduce manual coordination work, not replace your judgment.

## Quick Start

If you want the shortest path to a working setup:

1. Clone the repo to `~/.local/share/personal-ops`.
2. Run `./bootstrap` from the repo root.
3. Fill in `~/.config/personal-ops/config.toml`.
4. Add your Google OAuth client file at `~/.config/personal-ops/gmail-oauth-client.json`.
5. Run `personal-ops auth gmail login`.
6. Run `personal-ops auth google login`.
7. Finish with `personal-ops doctor --deep`.
8. Open `personal-ops console` to use the main daily workspace.

If you want a guided path instead of raw commands, read [START-HERE.md](START-HERE.md) next.

## Main Capabilities

- Gmail and Google Calendar awareness
- tasks and task suggestions
- planning recommendations
- drafts, approvals, and review flows
- assistant-safe audit history
- shared status and worklist views for humans and assistants
- a local operator console with narrow browser-safe actions
- an optional macOS desktop shell that opens the same console in a native window
- grouped inbox autopilot that prepares reply and follow-up drafts for review
- meeting-prep packets that stage agenda, checklist, and linked context before imminent meetings
- broader Google context inside the existing Drive scope, including narrow Google Sheets previews and richer related-file grouping
- planning autopilot bundles that stage grouped execution work before you apply it
- outbound autopilot groups that carry reviewed mail work through request-approval, approve, and send
- continuous autopilot that warms inbox, meetings, planning, outbound, and day-start surfaces before you ask
- machine-aware backups and restore guardrails

## Project Status

The assistant-led buildout is complete through Phase 38. The project is now in a stable local-first state with:

- a local daemon, CLI, HTTP API, and MCP bridge
- a browser console for day-to-day review
- an optional macOS desktop shell for the same console
- grouped inbox, meeting, planning, and outbound preparation flows
- verification and recovery workflows
- durable roadmap and history documentation

This does not mean the project will never change. It means the large assistant-led buildout is complete and the current baseline is meant to be usable, verifiable, and maintainable.

The latest audit and cleanup pass also:

- fixed the current CLI regression on this branch
- made builds clean `dist/` before compile so test runs reflect the real source tree
- pruned the docs surface so historical phase artifacts now live under `docs/archive/`

Since that pass, the repo also merged the first Operator Home implementation slice:

- `workspace_home` now supports a richer operator-home shell with sectioned content
- the home summary now carries mode-aware shaping for `focus`, `day_start`, and `decisions`
- top-level home items now expose provenance, freshness, and confidence metadata
- CLI/status and console surfaces now tell the same operator-home story

For the most recent durable checkpoint, read [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md).

## Tech Stack

- Local daemon plus local database for one shared operational state
- Gmail-aware and Calendar-aware workflow context
- Task tracking, task suggestions, and planning recommendations
- Shared CLI, HTTP, and MCP access for both humans and assistants
- Local operator console served by the daemon with narrow browser-safe actions
- Optional macOS desktop shell built locally as an unsigned `.app`
- One-command bootstrap plus repo-managed wrapper and LaunchAgent install
- Explicit secret-permission repair with `personal-ops install fix-permissions`
- Backup, inspect, and machine-aware restore flows with rescue snapshots
- Operator-gated approvals, reviews, and mutation flows
- Assistant-safe audit feed with categorized recent activity
- Clear separation between safe reads and risky real-world actions

## Current Product Shape

Today, the repo includes:

- `./bootstrap` for fresh-machine setup
- local install commands for wrappers, LaunchAgent setup, and install checks
- CLI, local HTTP API, and MCP bridge access
- a local operator console opened with `personal-ops console`
- optional native shell install and launch with `personal-ops install desktop` and `personal-ops desktop open`
- `personal-ops inbox autopilot` for grouped inbox draft preparation and review handoff
- `personal-ops workflow prep-meetings --event <eventId> --prepare` for one-meeting packet staging and refresh
- `personal-ops drive sheet <fileId>` for cached Google Sheets preview context
- `personal-ops planning autopilot` for prepared planning execution bundles
- `personal-ops outbound autopilot` for grouped outbound finish-work after review is complete
- `personal-ops autopilot status` and `personal-ops autopilot run` for warm-start freshness and manual safe prep
- backup create, inspect, and restore flows with machine-aware provenance
- end-to-end verification commands for smoke, full-stack, console, and LaunchAgent checks
- one-command local release verification with `npm run verify:all` from `app/`
- formal local release gate with `npm run release:check` from `app/`
- a first CI baseline for typecheck, tests, and smoke verification on pushes and PRs
- recurring-friendly local health checks with `personal-ops health check`
- explicit product version output with `personal-ops version`
- source-first tagged releases with notes in `CHANGELOG.md`
- in-place upgrade guidance in `UPGRADING.md`

## Learn More

- Start here: [START-HERE.md](START-HERE.md)
- Quick guide: [QUICK-GUIDE.md](QUICK-GUIDE.md)
- Operations runbook: [OPERATIONS.md](OPERATIONS.md)
- Release checklist: [RELEASING.md](RELEASING.md)
- Upgrade guide: [UPGRADING.md](UPGRADING.md)
- Release notes: [CHANGELOG.md](CHANGELOG.md)
- Architecture guide: [ARCHITECTURE.md](ARCHITECTURE.md)
- Client usage contract: [CLIENTS.md](CLIENTS.md)
- Assistant-led roadmap: [docs/ASSISTANT-LED-ROADMAP.md](docs/ASSISTANT-LED-ROADMAP.md)
- Current state note: [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md)
- Assistant-led history summary: [docs/ASSISTANT-LED-HISTORY-SUMMARY.md](docs/ASSISTANT-LED-HISTORY-SUMMARY.md)
- New machine setup appendix: [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
- Legacy program summary: [docs/PROGRAM-COMPLETE-SUMMARY.md](docs/PROGRAM-COMPLETE-SUMMARY.md)
- Deep system audit: [docs/2026-03-24-system-audit.md](docs/2026-03-24-system-audit.md)

## License

MIT
