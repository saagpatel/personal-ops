# OPERATIONS

This is the practical runbook for operating `personal-ops` after Phases 1 to 8.

Use this document for:

- install and bootstrap
- auth and local runtime setup
- local secret handling and re-auth recovery
- machine ownership and intentional migration
- operator console access and narrow browser-safe actions
- operator automations
- daily commands
- backup and restore
- verification and troubleshooting

## Runtime shape

`personal-ops` runs as:

- a local daemon
- a local SQLite-backed state directory
- a same-origin local operator console
- generated local wrappers for CLI, daemon, and MCP usage
- a LaunchAgent-managed background runtime on macOS

Main directories:

- config: `~/.config/personal-ops`
- state: `~/Library/Application Support/personal-ops`
- logs: `~/Library/Logs/personal-ops`
- default repo path: `~/.local/share/personal-ops`

## Secret model

`personal-ops` uses a small set of machine-local secrets and control files:

- `~/.config/personal-ops/config.toml`
  The local mailbox, runtime, and auth path configuration.
- `~/.config/personal-ops/policy.toml`
  Local policy such as `allow_send`.
- `~/.config/personal-ops/gmail-oauth-client.json`
  The Google Desktop OAuth client JSON for this operator workflow.
- `~/Library/Application Support/personal-ops/local-api-token`
  The operator CLI bearer token for the local HTTP API.
- `~/Library/Application Support/personal-ops/assistant-api-token`
  The assistant-safe bearer token for local assistant clients.
- Keychain item for the configured mailbox
  The stored Gmail refresh token used to reach Gmail and Google Calendar.

Important rules:

- `personal-ops` is single-primary-machine by default
- backups are the supported recovery and intentional migration path
- restore replaces local state; it does not merge state
- snapshots do not restore OAuth client JSON, API tokens, or Keychain secrets
- rerunning install commands is safe; deleting secrets by hand is not a normal workflow
- if auth breaks, prefer install-check, doctor, and re-auth over ad hoc local cleanup
- if secret file permissions drift too broad, run `personal-ops install fix-permissions`

## Install and bootstrap

### New machine path

From the repo root:

```bash
./bootstrap
```

That path:

- installs app dependencies
- builds the TypeScript app
- creates default runtime files
- installs local wrappers
- installs and reloads the LaunchAgent
- runs a local install check

### Files and artifacts created

Bootstrap and install create:

- `~/.config/personal-ops/config.toml`
- `~/.config/personal-ops/policy.toml`
- `~/.config/personal-ops/gmail-oauth-client.json`
- `~/.local/bin/personal-ops`
- `~/.local/bin/personal-opsd`
- `~/.codex/bin/personal-ops-mcp`
- `~/.claude/bin/personal-ops-mcp`
- `~/Library/LaunchAgents/com.d.personal-ops.plist`

## Auth flow

### Required operator steps

After bootstrap:

1. fill in `~/.config/personal-ops/config.toml`
2. place the Google Desktop OAuth client JSON at `~/.config/personal-ops/gmail-oauth-client.json`
3. run:

```bash
personal-ops auth gmail login
personal-ops auth google login
```

Finish with:

```bash
personal-ops doctor --deep
```

### Safe re-auth path

If auth is missing, stale, or attached to the wrong mailbox:

1. confirm `config.toml` has the mailbox you intend to use
2. confirm `gmail-oauth-client.json` is present and configured
3. run `personal-ops install check`
4. rerun:

```bash
personal-ops auth gmail login
personal-ops auth google login
personal-ops doctor --deep
```

Use the same mailbox for both login flows. If the signed-in Google account does not match `config.toml`, update the config or rerun auth with the correct account.

## Daily commands

These are the main operator commands after setup:

- `personal-ops console`
  Opens the local operator console in the browser.
- `personal-ops now`
  The shortest attention-oriented summary.
- `personal-ops status`
  The full readiness summary with next attention and health context.
- `personal-ops worklist`
  The full attention queue.
- `personal-ops doctor`
  Local diagnostics with next-step guidance.
- `personal-ops health check`
  The recurring-friendly compact health pass for install, runtime, and snapshot freshness.
- `personal-ops install check`
  Local install, wrapper, and LaunchAgent verification without needing the daemon.

Other common commands:

- `personal-ops doctor --deep`
  Adds live Gmail and Google Calendar verification.
- `personal-ops backup create`
  Creates a recovery snapshot with machine provenance.
- `personal-ops backup inspect <snapshotId>`
  Inspects snapshot contents and warnings.

## Operator automations

The first post-launch automation layer adds three read-first weekday automations:

- Morning Brief
- Midday Health Guard
- End-of-Day Wrap-Up

These automations:

- use the existing `personal-ops` CLI as their source of truth
- stay read-first
- open one inbox item each run
- do not send, restore, approve, re-authenticate, or mutate state

Use [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md) as the source of truth for:

- schedules
- automation ids
- workspace path
- prompt intent
- pause, update, and recreate steps

## Operator console

The current console is served by the daemon and is lightly interactive by design.

Open it with:

```bash
personal-ops console
```

Or print the one-time launch URL without opening the browser:

```bash
personal-ops console --print-url
```

Console rules:

- browser access uses a local browser session, not the raw operator API token
- the session is local-only, daemon-local, and intentionally narrow
- daemon restart clears browser sessions
- if the browser session expires, rerun `personal-ops console`
- CLI remains the path for higher-trust and broader mutating actions

Current console sections:

- Overview
- Worklist
- Approvals
- Drafts
- Planning
- Audit
- Backups

Browser-safe console actions now include:

- create snapshot
- apply, snooze, and reject a planning recommendation
- snooze or reject a planning recommendation group

These actions always require explicit confirmation in the browser.

Still CLI-only:

- approvals
- task edits and task lifecycle changes
- restore
- auth login and re-auth flows
- send and send-window control
- sync and broader admin actions

The console also surfaces exact CLI commands for the actions that still intentionally stay outside browser scope.

## Wrappers and LaunchAgent

### Wrapper behavior

Wrappers are generated from code and may be safely reinstalled.

Useful commands:

```bash
personal-ops install all
personal-ops install fix-permissions
personal-ops install wrapper --kind cli
personal-ops install wrapper --kind daemon
personal-ops install wrapper --kind mcp --assistant codex
personal-ops install wrapper --kind mcp --assistant claude
```

### LaunchAgent behavior

The LaunchAgent is the normal macOS background runtime path.

Useful commands:

```bash
personal-ops install launchagent
personal-ops install check
```

If the daemon is unreachable, the CLI will point you toward:

- `personal-ops install check`
- `personal-ops doctor`
- restarting the LaunchAgent
- starting `personal-opsd` directly

## Recurring health checks

Use the compact recurring health pass when you want one repeatable local check instead of remembering several commands:

```bash
personal-ops health check
```

Useful variants:

```bash
personal-ops health check --deep
personal-ops health check --max-snapshot-age-hours 24
```

This check:

- runs local install health
- verifies daemon reachability
- runs doctor or deep doctor
- warns when the latest snapshot is too old
- exits non-zero when attention is needed, which makes it suitable for recurring local automation

For the full ship gate, use the release checklist in [RELEASING.md](RELEASING.md).

## Release and maintenance gate

From `app/`, the full local release gate is:

```bash
npm run release:check
```

That is the formal local ship path.

GitHub CI covers the lighter baseline:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`

## Backup and restore

### Snapshot create and inspect

```bash
personal-ops backup create
personal-ops backup list
personal-ops backup inspect <snapshotId>
```

### Restore behavior

Restore is a recovery and intentional migration path, not a sync or multi-machine workflow.

Default behavior:

- restore requires `--yes`
- the target snapshot is inspected first
- a rescue snapshot is created before changes are applied
- the live database is restored
- config and policy restore are opt-in
- tokens, OAuth client JSON, and Keychain secrets are not restored automatically
- cross-machine restore requires `--allow-cross-machine`
- legacy snapshots without machine provenance still restore, but they warn as unknown provenance

Example:

```bash
personal-ops backup restore <snapshotId> --yes
personal-ops backup restore <snapshotId> --yes --with-config --with-policy
personal-ops backup restore <snapshotId> --yes --allow-cross-machine
```

After a cross-machine restore:

- rerun `personal-ops doctor --deep`
- rerun local auth if Gmail or Google Calendar access needs to be re-established
- treat the restored state as intentional migration or recovery, not sync

## What is safe to rerun

These are meant to be safe repeat operations:

- `./bootstrap`
- `personal-ops install all`
- `personal-ops install fix-permissions`
- `personal-ops install check`
- `personal-ops install launchagent`
- `personal-ops doctor`
- `personal-ops doctor --deep`
- `personal-ops status`
- `personal-ops worklist`
- `personal-ops backup create`

## Verification

### Local project verification

From `app/`:

```bash
npm run verify:all
```

`verify:all` runs:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`

### CI baseline

GitHub Actions now runs the stable cross-platform subset on pushes and pull requests:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`

### Live operator sanity path

```bash
personal-ops console --print-url
personal-ops --help
personal-ops now
personal-ops status
personal-ops doctor
personal-ops install check
personal-ops doctor --deep --json
personal-ops backup create --json
```

## Troubleshooting

### Setup problems

Symptoms:

- `setup required`
- missing mailbox
- missing OAuth client
- install check warnings or failures

Use:

```bash
personal-ops install check
personal-ops doctor
```

Likely fixes:

- fill in `config.toml`
- place the OAuth client JSON
- replace the OAuth client JSON if it is malformed, placeholder-only, or not a Desktop OAuth client
- run `personal-ops install fix-permissions` if secret files are readable by group or world
- rerun auth login commands
- rerun `personal-ops install all`

### Daemon problems

Symptoms:

- daemon unreachable
- CLI says it cannot reach the local daemon

Use:

```bash
personal-ops install check
personal-ops doctor
personal-ops install launchagent
personal-opsd
```

If you manage launchd directly, restart the LaunchAgent and rerun `personal-ops status`.

### Auth problems

Symptoms:

- mailbox not connected
- deep doctor failures
- Gmail or Calendar access failures

Use:

```bash
personal-ops doctor
personal-ops doctor --deep
personal-ops auth gmail login
personal-ops auth google login
```

Common auth and secret interpretations:

- missing or placeholder OAuth client JSON
  Replace `~/.config/personal-ops/gmail-oauth-client.json`, then rerun install-check and the auth login flow.
- wrong mailbox authenticated
  Update `config.toml` or rerun auth with the intended Google account.
- Keychain token missing
  Rerun both auth login commands so the refresh token is stored again.
- Keychain access unavailable
  Check local Keychain access on this Mac, then rerun auth if needed.
- stale or revoked Google grant
  Rerun both auth login commands and accept the requested access again.

## Read next

- [START-HERE.md](START-HERE.md)
- [QUICK-GUIDE.md](QUICK-GUIDE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
