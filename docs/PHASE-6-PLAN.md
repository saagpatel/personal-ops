# Phase 6 Plan

## Title

Strengthen Secrets and Safety Operations

## Summary

Phase 6 is a conservative secrets-and-auth hardening pass on top of the verified Phase 1 to 5 baseline.

Chosen defaults:

- keep the existing command surface
- improve install-check, doctor, deep doctor, and existing auth login flows in place
- do not add reset, delete, or rotation commands
- do not change HTTP, MCP, governance, audit, or schema contracts
- close the phase with full verification plus branch, commit, push, and draft PR closeout

## Main additions

- add shared secret validation for:
  - OAuth client JSON presence, shape, and placeholder detection
  - API token presence, emptiness, and file-permission posture
  - key auth config values needed for re-auth
- add richer Keychain probing so doctor and auth flows can distinguish:
  - missing token
  - unavailable Keychain access
  - connected mailbox mismatch
- improve auth recovery messages for:
  - malformed OAuth config
  - missing refresh token
  - wrong mailbox
  - stale or revoked Google grants

## Operator guidance updates

Update:

- `OPERATIONS.md`
- `QUICK-GUIDE.md`
- `START-HERE.md`
- `docs/NEW-MACHINE-SETUP.md`
- `docs/IMPROVEMENT-ROADMAP.md`
- `docs/PHASE-6-ROLLOUT.md`

The docs must explain:

- what each secret is for
- what is local-only and machine-owned
- what restore never restores
- how to re-auth safely
- what is safe to rerun

## Verification

Phase 6 is complete only if all of these pass:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- live sanity pass:
  - `personal-ops --help`
  - `personal-ops auth --help`
  - `personal-ops install check`
  - `personal-ops status`
  - `personal-ops worklist`
  - `personal-ops doctor`
  - `personal-ops doctor --deep --json`
  - `personal-ops backup create --json`

## Closeout

Phase 6 must end with:

- branch `codex/phase-6-secrets-safety-ops`
- Conventional Commit commits
- push to GitHub
- draft PR
- `docs/PHASE-6-ROLLOUT.md` updated with verification results and closeout metadata
