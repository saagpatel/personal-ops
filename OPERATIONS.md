# OPERATIONS

This is the practical runbook for operating `personal-ops` after Phases 1 to 4.

Use this document for:

- install and bootstrap
- auth and local runtime setup
- daily commands
- backup and restore
- verification and troubleshooting

## Runtime shape

`personal-ops` runs as:

- a local daemon
- a local SQLite-backed state directory
- generated local wrappers for CLI, daemon, and MCP usage
- a LaunchAgent-managed background runtime on macOS

Main directories:

- config: `~/.config/personal-ops`
- state: `~/Library/Application Support/personal-ops`
- logs: `~/Library/Logs/personal-ops`
- default repo path: `~/.local/share/personal-ops`

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

## Daily commands

These are the main operator commands after setup:

- `personal-ops now`
  The shortest attention-oriented summary.
- `personal-ops status`
  The full readiness summary with next attention and health context.
- `personal-ops worklist`
  The full attention queue.
- `personal-ops doctor`
  Local diagnostics with next-step guidance.
- `personal-ops install check`
  Local install, wrapper, and LaunchAgent verification without needing the daemon.

Other common commands:

- `personal-ops doctor --deep`
  Adds live Gmail and Google Calendar verification.
- `personal-ops backup create`
  Creates a same-machine recovery snapshot.
- `personal-ops backup inspect <snapshotId>`
  Inspects snapshot contents and warnings.

## Wrappers and LaunchAgent

### Wrapper behavior

Wrappers are generated from code and may be safely reinstalled.

Useful commands:

```bash
personal-ops install all
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

## Backup and restore

### Snapshot create and inspect

```bash
personal-ops backup create
personal-ops backup list
personal-ops backup inspect <snapshotId>
```

### Restore behavior

Restore is a same-machine recovery path, not a sync or multi-machine workflow.

Default behavior:

- restore requires `--yes`
- the target snapshot is inspected first
- a rescue snapshot is created before changes are applied
- the live database is restored
- config and policy restore are opt-in
- tokens, OAuth client JSON, and Keychain secrets are not restored automatically

Example:

```bash
personal-ops backup restore <snapshotId> --yes
personal-ops backup restore <snapshotId> --yes --with-config --with-policy
```

## What is safe to rerun

These are meant to be safe repeat operations:

- `./bootstrap`
- `personal-ops install all`
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
npm run typecheck
npm test
npm run verify:smoke
npm run verify:full
```

### Live operator sanity path

```bash
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

## Read next

- [START-HERE.md](START-HERE.md)
- [QUICK-GUIDE.md](QUICK-GUIDE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
