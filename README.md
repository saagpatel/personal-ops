# personal-ops

`personal-ops` is a private local control layer for your personal workflow.

It gives you one shared system for inbox state, calendar context, tasks, planning recommendations, approvals, and assistant-safe operational reads so tools like Codex or Claude can help without directly taking over your accounts.

## What Exactly It Does

`personal-ops` runs as a local service on your machine and acts as the shared source of truth for:

- Gmail and Google Calendar awareness
- tasks and task suggestions
- planning recommendations
- drafts, approvals, and review flows
- assistant-safe audit history
- shared status and worklist views for humans and assistants
- a local operator console with narrow browser-safe actions
- grouped inbox autopilot that prepares reply and follow-up drafts for review
- meeting-prep packets that stage agenda, checklist, and linked context before imminent meetings
- machine-aware backups and restore guardrails

In practice, that means it can:

- sync recent mailbox and calendar context into one local system
- track what needs attention
- suggest useful work like reply blocks, follow-up blocks, or prep blocks
- show assistants safe operational context
- keep higher-risk actions behind operator control
- give the operator both CLI and local browser views into the same state
- support fresh-machine bootstrap, local install, and LaunchAgent setup from repo-managed commands

## Main Features

- Local daemon plus local database for one shared operational state
- Gmail-aware and Calendar-aware workflow context
- Task tracking, task suggestions, and planning recommendations
- Shared CLI, HTTP, and MCP access for both humans and assistants
- Local operator console served by the daemon with narrow browser-safe actions
- One-command bootstrap plus repo-managed wrapper and LaunchAgent install
- Explicit secret-permission repair with `personal-ops install fix-permissions`
- Backup, inspect, and machine-aware restore flows with rescue snapshots
- Operator-gated approvals, reviews, and mutation flows
- Assistant-safe audit feed with categorized recent activity
- Clear separation between safe reads and risky real-world actions

## Exciting Features

- Multiple assistants can use the same trusted workflow layer instead of each inventing their own Gmail or calendar logic
- The system can turn inbox and calendar pressure into actual planning recommendations instead of just showing raw chaos
- The operator can open a local browser console for status, worklist, approvals, drafts, planning, audit, and snapshots, with only narrow browser-safe actions enabled in the UI
- New-machine setup, wrappers, LaunchAgent wiring, and full-stack verification are built into the repo instead of being left as ad hoc manual steps
- Backup manifests now carry machine provenance, and cross-machine restore requires explicit operator intent instead of quietly acting like sync
- Assistants get useful context without getting unlimited control over your accounts
- You get a real audit trail of what the system did and why
- The whole thing runs locally, so your workflow control plane lives on your machine

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
- `personal-ops inbox autopilot` for grouped inbox draft preparation and review handoff
- `personal-ops workflow prep-meetings --event <eventId> --prepare` for one-meeting packet staging and refresh
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
