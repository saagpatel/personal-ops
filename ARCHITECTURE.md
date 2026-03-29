# ARCHITECTURE

This document describes the current `personal-ops` system shape after Phases 1 to 4.

## Purpose

`personal-ops` is a local control plane for personal workflow.

It exists so assistants can help with inbox, calendar, task, planning, and draft workflow without taking direct ownership of provider-side logic or high-trust actions.

The trust model is intentional:

- assistants are clients of `personal-ops`
- the operator stays in charge of risky or externally mutating flows

## Runtime components

Main runtime pieces:

- local daemon
- local SQLite database
- local config and policy files
- operator CLI
- local HTTP API
- MCP bridge for assistants
- generated wrappers
- LaunchAgent-managed background runtime

## Control-plane flow

```mermaid
flowchart LR
  operator["Operator"] --> cli["CLI / wrappers"]
  assistants["Assistants (Codex, Claude)"] --> mcp["MCP bridge"]
  cli --> service["personal-ops daemon"]
  mcp --> service
  service --> db["Local SQLite state"]
  service --> config["Local config / policy / tokens / logs"]
  service --> gmail["Gmail"]
  service --> calendar["Google Calendar"]
```

## Local state and path model

Default path layout:

- repo app path: `~/.local/share/personal-ops/app`
- config: `~/.config/personal-ops`
- state: `~/Library/Application Support/personal-ops`
- logs: `~/Library/Logs/personal-ops`

Important runtime artifacts:

- `config.toml`
- `policy.toml`
- OAuth client JSON
- local API token files
- SQLite database
- generated install manifest
- recovery snapshots

## Interface surfaces

### CLI

The CLI is the operator-facing surface for:

- status
- worklist
- doctor
- install and backup
- inbox, calendar, tasks, planning, approvals, and reviews

Recent operator-focused entrypoints:

- `personal-ops now`
- `personal-ops status`
- `personal-ops worklist`
- `personal-ops doctor`
- `personal-ops install check`

### Local HTTP API

The local HTTP API is the stable machine-readable surface used by the CLI and other local clients.

It remains:

- local-only
- token-gated
- intentionally narrow for audit and governance

### MCP bridge

The MCP bridge is the assistant-facing access path.

It is for shared safe reads and limited safe creation flows, not provider ownership or operator-only control.

Wrappers currently exist for:

- Codex
- Claude

## Trust boundaries

### Assistant-safe surfaces

Assistants may read shared operational state such as:

- status and worklist
- inbox and calendar context
- tasks and planning reads
- assistant-safe audit reads

Assistants may create only the limited suggestion surfaces already allowed by contract.

### Operator-only surfaces

These remain outside assistant control:

- live send control
- review opening and resolve flows
- inbox and calendar sync mutation
- calendar writes
- planning recommendation apply, reject, snooze, refresh, and replan
- policy and governance mutation

`CLIENTS.md` remains the authoritative contract for the safe read surface and operator-only boundaries.

## Current code shape

After Phase 2 and Phase 4, the repo uses compatibility facades plus domain modules:

- `app/src/cli.ts`
  thin CLI wiring plus command registration
- `app/src/formatters.ts`
  formatter facade that exports domain formatter modules
- `app/src/service.ts`
  main service facade with extracted status, audit, and install helpers
- `app/src/db.ts`
  stable database facade

Supporting domain folders now include:

- `app/src/cli/`
- `app/src/formatters/`
- `app/src/service/`

This is not the final modular shape, but it is the stable Phase 2 baseline the later phases now build on.

## Where future work should land

Use these rules for future changes:

- docs and onboarding guidance
  update `START-HERE.md`, `QUICK-GUIDE.md`, `OPERATIONS.md`, and `ARCHITECTURE.md`
- operational install, auth, bootstrap, restore, and troubleshooting changes
  update `OPERATIONS.md` first, then supporting setup docs if needed
- trust model or client contract changes
  update `CLIENTS.md` and the relevant rollout docs
- architecture or subsystem shape changes
  update `ARCHITECTURE.md` and the active phase docs
- future operator console work
  treat the existing local HTTP API as the primary backend surface and document any UI-driven backend changes here

## Related docs

- [START-HERE.md](START-HERE.md)
- [QUICK-GUIDE.md](QUICK-GUIDE.md)
- [OPERATIONS.md](OPERATIONS.md)
- [CLIENTS.md](CLIENTS.md)
- [docs/IMPROVEMENT-ROADMAP.md](docs/IMPROVEMENT-ROADMAP.md)
