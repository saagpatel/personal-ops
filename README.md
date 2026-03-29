# personal-ops

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript)](#) [![Status](https://img.shields.io/badge/status-WIP-yellow?style=flat-square)](#)

> A private local control plane for personal workflow — shared source of truth for inbox, calendar, tasks, and assistant-safe operations.

personal-ops runs as a local daemon that gives AI assistants and operator tooling a shared, audited layer for Gmail and Google Calendar awareness, task tracking, draft/approval flows, and planning recommendations — without handing over unlimited account access.

## Features

- **Inbox and calendar context** — Syncs recent mail and calendar state into a local database
- **Task tracking and suggestions** — Tracks what needs attention; surfaces reply blocks, follow-up blocks, and prep blocks
- **Draft and approval flows** — Mutations require explicit operator confirmation; nothing sends without a token
- **MCP interface** — 24 tools for AI assistants (safe reads vs. gated mutations clearly separated)
- **Local operator console** — Browser-accessible status, worklist, approvals, drafts, and audit feed
- **Bootstrap and LaunchAgent wiring** — One-command install, wrappers, and full-stack verification built into the repo

## Quick Start

```bash
git clone https://github.com/saagpatel/personal-ops.git
cd personal-ops
# Follow START-HERE.md for bootstrap and credential setup
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Interface | MCP server + local HTTP daemon |
| Storage | Local SQLite database |
| Integrations | Gmail API, Google Calendar API |

> **Status: Work in Progress** — Core daemon, MCP tools, and approval flows are functional. Operator console UI in progress.

## License

MIT