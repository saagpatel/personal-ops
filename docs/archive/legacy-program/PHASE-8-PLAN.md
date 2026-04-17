# Phase 8 Plan

## Title

Build the Lightweight Operator Console

## Summary

Phase 8 adds a thin same-origin local operator console on top of the existing daemon and HTTP API.

Locked decisions:

- read-first console scope
- browser-specific local session, separate from CLI and MCP bearer tokens
- `personal-ops console` as the launch path
- no high-trust or externally mutating actions in the UI
- Playwright-based browser verification

## Key Changes

- add daemon-served console routes for the shell, static assets, one-time session grants, and grant consumption
- add a local browser session model that is in-memory, single-purpose, and read-only
- add a no-framework console UI with pages for Overview, Worklist, Approvals, Drafts, Planning, Audit, and Backups
- reuse existing read endpoints wherever possible
- add browser-aware verification and docs updates for the console flow

## Verification

Required verification for Phase 8:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- live sanity pass for `personal-ops console --print-url`, browser load, `status`, `doctor --deep --json`, and `backup create --json`

## Assumptions

- the console stays read-first in Phase 8
- browser sessions authorize only the console read routes
- CLI remains the path for high-trust and mutating actions
- the daemon remains the single backend surface for both CLI and console
