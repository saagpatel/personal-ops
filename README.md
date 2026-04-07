# personal-ops

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript)](#) [![Status](https://img.shields.io/badge/status-WIP-yellow?style=flat-square)](#)

> A private local control plane for personal workflow - shared source of truth for inbox, calendar, tasks, and assistant-safe operations.

personal-ops runs as a local daemon that gives AI assistants and operator tooling a shared, audited layer for Gmail and Google Calendar awareness, task tracking, draft/approval flows, and planning recommendations - without handing over unlimited account access.

## Features

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

## Quick Start

- sync recent mailbox and calendar context into one local system
- track what needs attention
- suggest useful work like reply blocks, follow-up blocks, or prep blocks
- show assistants safe operational context
- keep higher-risk actions behind operator control
- give the operator both CLI and local browser views into the same state
- optionally wrap the same console in a local macOS desktop app without changing the control plane
- support fresh-machine bootstrap, local install, and LaunchAgent setup from repo-managed commands

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

> **Status: Work in Progress** - Core daemon, MCP tools, and approval flows are functional. Operator console UI in progress.

## Why You Would Want To Use It

You would want `personal-ops` if you want AI help with your personal workflow but do not want to hand over unlimited power to an assistant.

It is useful when you want:

- one place that knows the current operational state
- safer AI-assisted inbox, task, and calendar workflows
- less duplicated logic across different assistants
- clearer visibility into what is happening and what needs attention
- a local operator UI without giving the browser full control over risky actions
- a system that is inspectable, documented, and operator-controlled

The core idea is simple:

- assistants can help
- the operator stays in charge

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
- Next roadmap: [docs/ASSISTANT-LED-ROADMAP.md](docs/ASSISTANT-LED-ROADMAP.md)
- New machine setup appendix: [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
- Full project summary: [docs/PROGRAM-COMPLETE-SUMMARY.md](docs/PROGRAM-COMPLETE-SUMMARY.md)
- Deep system audit: [docs/2026-03-24-system-audit.md](docs/2026-03-24-system-audit.md)

## License

MIT
