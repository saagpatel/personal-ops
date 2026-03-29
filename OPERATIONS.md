# OPERATIONS

This is the practical runbook for operating `personal-ops` after Phases 1 to 8.

Use this document for:

- install and bootstrap
- auth and local runtime setup
- local secret handling and re-auth recovery
- optional GitHub PR and review context setup
- optional Google Docs, Google Sheets, and Drive metadata context setup
- machine ownership and intentional migration
- operator console access and narrow browser-safe actions
- operator automations
- daily commands
- backup and restore
- verification and troubleshooting
- release and upgrade flow

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

Official distribution model in this phase:

- source checkout plus `./bootstrap`
- tagged source releases with notes in `CHANGELOG.md`
- in-place upgrades through repo update plus rerun `./bootstrap`
- no packaged installer or package-manager distribution yet
- optional local macOS desktop shell built as an unsigned `.app`

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
- Keychain item for the configured GitHub service
  The stored GitHub PAT used for read-only PR and review context when the optional GitHub integration is enabled.

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

### Optional macOS desktop shell

Assistant-Led Phase 4 adds a macOS-only native shell around the existing console.

Install it only if you want the console in a native window:

```bash
personal-ops install desktop
personal-ops desktop status
personal-ops desktop open
```

Important desktop-shell rules:

- it uses the same daemon, the same local API, and the same console UI
- it installs a locally built unsigned app bundle at `~/Applications/Personal Ops.app`
- it is optional and does not change the baseline `./bootstrap` path
- it does not widen browser-safe or assistant-safe mutation scope
- send, approval decisions, restore, auth mutation, and destructive actions remain gated

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

### Optional GitHub PR and review context

Phase 7 adds narrow GitHub context for review requests and authored pull request attention.

Enable it in `~/.config/personal-ops/config.toml`:

```toml
[github]
enabled = true
included_repositories = ["owner/repo"]
sync_interval_minutes = 10
keychain_service = "personal-ops.github"
```

Then run:

```bash
personal-ops auth github login
personal-ops github sync now
personal-ops github status
```

Important GitHub rules:

- GitHub.com only in this phase
- repository scope is explicit and opt-in
- the token is stored in Keychain
- the integration is read-first
- no GitHub write actions are added in this phase
- issue ingestion and broader repo browsing are intentionally deferred

### Optional Google Docs, Sheets, and Drive metadata context

Assistant-Led Phase 5 broadens the existing Drive integration to include narrow cached Google Sheets previews plus richer related-file grouping.

Enable it in `~/.config/personal-ops/config.toml`:

```toml
[drive]
enabled = true
included_folders = ["folder-id-or-url"]
included_files = ["file-id-or-url"]
sync_interval_minutes = 30
recent_docs_limit = 10
```

Then rerun Google auth if these scopes have not been granted yet:

```bash
personal-ops auth google login
personal-ops drive sync now
personal-ops drive status
personal-ops drive sheet <fileId>
```

Important Google context rules:

- Google Docs plus narrow Google Sheets previews plus Drive metadata only in this phase
- explicit scope only through `included_folders` and `included_files`
- URLs and raw Google IDs are both accepted in config
- explicit stored links are used first from calendar descriptions, task notes, and draft bodies
- richer related-file grouping uses explicit links first, shared-parent files second, and only a small recent fallback last
- no Google write actions are added in this phase
- Sheets content is cached as a bounded preview only
- Slides extraction and Shared Drives are intentionally deferred

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
- `personal-ops install desktop`
  Builds and installs or refreshes the optional local macOS desktop shell.
- `personal-ops desktop open`
  Opens or focuses the optional local macOS desktop shell.
- `personal-ops desktop status`
  Shows desktop install state, toolchain readiness, installed app path, and console session handoff readiness.
- `personal-ops version`
  Shows the current product version, release tag, release gate, and official upgrade hint.
- `personal-ops workflow prep-day`
  The preferred day-start bundle with current readiness, top attention, time-sensitive items, and exact next commands.
- `personal-ops now`
  The shortest attention-oriented summary.
- `personal-ops status`
  The full readiness summary with next attention and health context.
- `personal-ops worklist`
  The full attention queue.
- `personal-ops doctor`
  Local diagnostics with next-step guidance.
- `personal-ops health check`
  The recurring-friendly compact health pass for install, runtime, snapshot freshness, retention pressure, and recovery rehearsal confidence.
- `personal-ops install check`
  Local install, wrapper, and LaunchAgent verification without needing the daemon.

Other common commands:

- `personal-ops workflow now-next`
  The focused answer to what should happen next right now.
- `personal-ops doctor --deep`
  Adds live Gmail and Google Calendar verification.
- `personal-ops workflow follow-up-block`
  Builds the bounded inbox and stale follow-up action block.
- `personal-ops workflow prep-meetings --today`
  Builds the current-day meeting prep bundle.
- `personal-ops workflow prep-meetings --next-24h`
  Builds the next-24-hours meeting prep bundle.
- `personal-ops workflow prep-meetings --event <eventId>`
  Shows one meeting-prep packet in detail.
- `personal-ops workflow prep-meetings --event <eventId> --prepare`
  Prepares or refreshes one meeting-prep packet, then returns the packet detail.
- `personal-ops github status`
  Shows whether the optional GitHub integration is connected and what PR attention is waiting.
- `personal-ops github reviews`
  Lists open review requests that need attention.
- `personal-ops github pulls`
  Lists the open authored PR attention queue from the included repositories.
- `personal-ops github pr <owner/repo#number>`
  Shows one cached PR detail with check and review state.
- `personal-ops drive status`
  Shows whether the optional Drive and Docs context is connected and how much in-scope context is indexed.
- `personal-ops drive files`
  Lists the currently indexed in-scope Drive files.
- `personal-ops drive doc <fileId>`
  Shows one cached Google Doc text context entry.
- `personal-ops backup create`
  Creates a recovery snapshot with machine provenance.
- `personal-ops backup prune --dry-run`
  Previews which snapshots the retention policy would prune.
- `personal-ops backup prune --yes`
  Applies the local snapshot retention policy.
- `personal-ops backup inspect <snapshotId>`
  Inspects snapshot contents and warnings.

## Operator automations

The recurring automation layer now includes five operator automations:

- Morning Brief
- Midday Health Guard
- End-of-Day Wrap-Up
- End-of-Day Recovery Snapshot
- Weekly Recovery Rehearsal Reminder

These automations:

- use the existing `personal-ops` CLI as their source of truth
- stay read-first except for one narrow reliability automation
- open one inbox item each run
- do not send, restore, approve, or re-authenticate in the background
- only allow unattended local snapshot create and prune after a `ready` health gate

Use [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md) as the source of truth for:

- schedules
- automation ids
- workspace path
- prompt intent
- pause, update, and recreate steps

The daily briefing layer now centers on `personal-ops workflow prep-day`, while `personal-ops workflow now-next` answers the narrower “what should I do right now?” question. Morning Brief now uses both workflow bundles as its automation source of truth.

When Drive is configured, meeting prep and day-start workflows can also attach linked Google Docs context. Those related docs come from explicit stored links first, with only a small recent-doc fallback when no explicit link is available.

## Operator console

The current console is served by the daemon and is now the first assistant-led workspace layer.

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

- assistant queue safe actions such as local refresh and fresh snapshot creation
- grouped inbox autopilot draft preparation
- draft review open and resolve
- approval request handoff from a prepared draft
- meeting-packet preparation and refresh
- create snapshot
- apply, snooze, and reject a planning recommendation
- snooze or reject a planning recommendation group

The Overview section now leads with the assistant queue, then the current inbox autopilot block, then `Today's Prep`, then the current now-next guidance, then the day-start workflow bundle below it, including exact CLI commands and in-console detail handoff where available.

The Drafts section now acts as the grouped inbox review workspace:

- the assistant can stage grouped reply and follow-up drafts
- the operator can open and resolve draft review items in-browser
- approval can be requested from a prepared draft
- send still stays out of browser scope

When GitHub is configured, the Overview and worklist detail can also surface narrow PR and review queue context with exact CLI handoff plus an external GitHub link.

When calendar context is ready, the Overview and Worklist can also surface meeting-prep packets with:

- agenda draft
- prep checklist
- open questions
- related docs
- related threads
- exact next commands

Packet preparation is browser-safe in this phase, but attendee communication still stays outside browser scope.

These actions always require explicit confirmation in the browser.

Still CLI-only:

- approvals
- approval approve, reject, and send decisions
- task edits and task lifecycle changes
- restore
- auth login and re-auth flows
- send and send-window control
- broader admin actions outside the assistant queue allowlist

The console also surfaces exact CLI commands for the actions that still intentionally stay outside browser scope.

Workflow intelligence stays deterministic and read-first in this phase. It can recommend exact CLI commands, but it does not add a new bulk workflow executor or any new browser mutation scope.

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
- warns when retention candidates are waiting
- warns when recovery rehearsal is missing or stale
- exits non-zero when attention is needed, which makes it suitable for recurring local automation

For the full ship gate, use the release checklist in [RELEASING.md](RELEASING.md).

## Release and maintenance gate

From `app/`, the full local release gate is:

```bash
npm run release:check
```

That is the formal local ship path.

Version and release helpers:

```bash
personal-ops version
npm run release:prep -- --version X.Y.Z --dry-run
npm run release:notes -- --version X.Y.Z
```

GitHub CI covers the lighter baseline:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`

The source-first release workflow is:

1. land the intended changes on `main`
2. run `npm run release:check`
3. run `npm run release:prep -- --version X.Y.Z`
4. review `CHANGELOG.md`
5. commit the version bump and changelog
6. tag `vX.Y.Z`
7. push `main` and the tag
8. let the tag workflow publish the GitHub Release from the changelog section

Use [UPGRADING.md](UPGRADING.md) for the official in-place upgrade flow after changing branches or tags.

## Backup and restore

### Snapshot create and inspect

```bash
personal-ops backup create
personal-ops backup list
personal-ops backup inspect <snapshotId>
personal-ops backup prune --dry-run
personal-ops backup prune --yes
```

Retention policy in this phase:

- keep every snapshot from the last 24 hours
- for snapshots older than 24 hours and up to 14 days, keep the newest snapshot per local calendar day
- for snapshots older than 14 days and up to 8 weeks, keep the newest snapshot per local calendar week
- prune snapshots older than 8 weeks
- always keep the single newest snapshot

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
- `personal-ops backup prune --dry-run`

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
- `npm run verify:recovery`

`verify:recovery` is the restore confidence loop. It runs an isolated backup-and-restore rehearsal, verifies rescue snapshot behavior, checks machine provenance handling, verifies prune logic, and only then writes the local recovery rehearsal success stamp.

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
