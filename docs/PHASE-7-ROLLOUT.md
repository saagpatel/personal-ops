# Phase 7 Rollout

## Title

Decide the Multi-Machine Strategy

## What Changed

Phase 7 made the machine-ownership model explicit and enforced:

- added `machine-identity.json` for stable local machine ownership
- added `restore-provenance.json` to record restore history without replacing local ownership
- extended snapshot manifests with additive machine provenance and backup intent metadata
- added `--allow-cross-machine` to `personal-ops backup restore` so cross-machine restore requires explicit operator intent
- preserved same-machine restore behavior and legacy snapshot compatibility
- surfaced machine posture in `status`, `install check`, and `doctor`
- updated docs to make the supported model explicit: single primary machine, backup-based portability, no sync, no merge, and no multi-writer support

The phase preserved:

- existing operator command names other than the additive restore flag
- existing HTTP endpoints
- existing MCP tools
- current audit and governance boundaries
- current schema version
- current assistant permissions

## Public Interface Notes

Phase 7 preserves:

- existing operator command names, except the additive restore flag `--allow-cross-machine`
- existing HTTP endpoints
- existing MCP tools
- current audit and governance boundaries
- current schema version
- current assistant permissions

## Verification

Automated verification:

- `npm run typecheck`
  - passed
- `npm test`
  - passed (`111` passing)
- `npm run verify:smoke`
  - passed
- `npm run verify:full`
  - passed

Live sanity verification:

- `personal-ops --help`
  - passed
- `personal-ops install check`
  - passed after rerunning `personal-ops install all` to initialize the new machine identity on the pre-Phase-7 live install
- `personal-ops status`
  - passed and now reports the additive `machine` block with native state origin
- `personal-ops worklist`
  - passed
- `personal-ops doctor`
  - passed
- `personal-ops doctor --deep --json`
  - passed
- `personal-ops backup create --json`
  - passed and created snapshot `2026-03-29T08-13-08Z`
- `personal-ops backup inspect 2026-03-29T08-13-08Z --json`
  - passed

Live health summary after install refresh:

- `personal-ops install check --json`
  - `ready`
  - `32 pass / 1 warn / 0 fail`
- `personal-ops doctor --json`
  - `ready`
  - `47 pass / 1 warn / 0 fail`
- `personal-ops doctor --deep --json`
  - `ready`
  - `51 pass / 1 warn / 0 fail`

## Git Closeout

- branch name: `codex/phase-7-multi-machine-strategy`
- implementation commit: `45604de`
- pushed remote branch: `origin/codex/phase-7-multi-machine-strategy`
- draft PR link: `https://github.com/saagpatel/personal-ops/pull/4`
- PR base branch: `codex/phase-6-secrets-safety-ops`

## Notes

Acceptable warning:

- the live OAuth client file on this machine is currently mode `0644`, so `install check` and `doctor` warn that it should be tightened to owner-only access such as `0600`

Operational note:

- the live machine predated Phase 7, so the first live `install check` correctly warned that machine identity was missing
- rerunning `personal-ops install all` safely initialized the live machine identity, refreshed the daemon, and brought the install into the new model

Deferred follow-up:

- Phase 8 can surface machine identity, restore provenance, and cross-machine warnings in the future operator console without changing the Phase 7 model

## Recommended Next Phase

Phase 8: Build the Lightweight Operator Console.
