# Phase 6 Rollout

## Title

Strengthen Secrets and Safety Operations

## What Changed

Phase 6 completed a conservative secrets-and-safety hardening pass without widening permissions or changing external contracts.

Main changes:

- added a shared secret validation layer in `app/src/secrets.ts` for:
  - OAuth client file presence, placeholder detection, JSON validity, and Desktop OAuth shape checks
  - local API token presence, emptiness, and file-permission posture
  - Keychain probe results that distinguish missing items from unavailable access
- updated install-check and doctor reporting to classify setup and auth failures more precisely
- improved auth flow guidance for:
  - malformed or placeholder OAuth client files
  - missing refresh tokens
  - wrong-mailbox login attempts
  - stale or revoked Google grants that need re-auth
- updated operator docs so the secret model is explicit:
  - which files are machine-owned
  - what restore never restores
  - what is safe to rerun
  - how to recover from common auth and Keychain issues
- fixed a real snapshot safety edge discovered during closeout:
  - back-to-back snapshots created in the same second now get unique ids so a rescue snapshot cannot overwrite the snapshot being restored

## Public Interface Notes

Phase 6 preserved:

- existing operator command names
- existing HTTP and MCP contracts
- current audit and governance boundaries
- current schema version
- current assistant permissions

## Verification

Automated verification:

- `npm run typecheck`
  - passed
- `npm test`
  - passed, `105` tests green
- `npm run verify:smoke`
  - passed
- `npm run verify:full`
  - passed

Live sanity pass:

- `personal-ops --help`
  - passed
- `personal-ops auth --help`
  - passed
- `personal-ops install check --json`
  - passed with `state=ready`, `29 pass / 1 warn / 0 fail`
- `personal-ops status --json`
  - passed with `state=ready`
- `personal-ops worklist --json`
  - passed with `state=ready`
- `personal-ops doctor --json`
  - passed with `state=ready`, `38 pass / 0 warn / 0 fail`
- `personal-ops doctor --deep --json`
  - passed with `state=ready`, `42 pass / 0 warn / 0 fail`
- `personal-ops backup create --json`
  - passed and created snapshot `2026-03-29T07-46-13Z`

## Git Closeout

Closeout metadata for this phase:

- branch name: `codex/phase-6-secrets-safety-ops`
- commit hashes:
  - `bad039a` — main Phase 6 implementation
  - `f3fc443` — closeout metadata and PR recording
- pushed remote branch: `origin/codex/phase-6-secrets-safety-ops`
- draft PR link: [#3](https://github.com/saagpatel/personal-ops/pull/3)

## Notes

- acceptable live warning:
  - `install check` reports the real-machine OAuth client file at `0644`; this is a local file-permission hygiene warning, not a product failure
- no HTTP, MCP, audit, governance, or schema contracts were changed in this phase
- no destructive token reset, secret rotation, or Keychain deletion commands were added

## Recommended Next Phase

Phase 7: Decide the Multi-Machine Strategy.
