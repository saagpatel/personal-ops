# QUICK GUIDE

This is the shortest role-based way to get oriented in `personal-ops`.

## New operator

### What this system is

`personal-ops` is a local workflow control layer that keeps mailbox, calendar, task, planning, approval, and audit state in one place on your Mac.

It lets assistants help with your workflow without giving them direct control over Gmail, Google Calendar, or other risky actions.

It is single-primary-machine by default. Use backups for intentional recovery or migration, not sync.

### Fastest verified setup path

1. Clone the repo to `~/.local/share/personal-ops`.
2. Run `./bootstrap` from the repo root.
3. Fill in `~/.config/personal-ops/config.toml`.
4. Add `~/.config/personal-ops/gmail-oauth-client.json`.
5. Run `personal-ops auth gmail login`.
6. Run `personal-ops auth google login`.
7. Finish with `personal-ops doctor --deep`.

Keep these pieces separate:

- `config.toml` chooses the mailbox and local runtime paths
- `gmail-oauth-client.json` is the Google Desktop OAuth client
- the local API token files gate local CLI and assistant access
- the Gmail refresh token lives in Keychain and is never restored from snapshots
- the optional GitHub PAT also lives in Keychain and is scoped only to the repositories you explicitly opt into
- backups may move state intentionally, but auth and secrets still stay machine-local

### Daily commands

- `personal-ops console`
  Opens the local operator console with narrow browser-safe actions for planning and snapshots.
- `personal-ops version`
  Shows the current product version and the official source-first upgrade path.
- `personal-ops workflow now-next`
  The focused “what should I do next right now?” command.
- `personal-ops workflow prep-day`
  The preferred day-start bundle with exact next commands.
- `personal-ops github status`
  The optional GitHub PR and review queue summary.
- `personal-ops now`
  The shortest attention-oriented summary.
- `personal-ops status`
  The full readiness and health summary.
- `personal-ops worklist`
  The full queue of what needs attention.
- `personal-ops doctor`
  The local diagnostics path.
- `personal-ops install check`
  The local install and wrapper check.

### Daily automation loop

The recurring automation loop now includes:

- Morning Brief
- Midday Health Guard
- End-of-Day Wrap-Up
- End-of-Day Recovery Snapshot
- Weekly Recovery Rehearsal Reminder

The briefing automations stay read-first. The reliability automations are limited to local snapshot create and local prune after a `ready` health gate.

The preferred operator rhythm now starts with `personal-ops workflow prep-day`, uses `personal-ops workflow now-next` when you need the single best next move, and then uses `worklist`, `follow-up-block`, or `prep-meetings` only when you need a narrower bundle.

The console now complements that loop by leading with the same now-next guidance and day-start bundle on Overview, and it can also surface GitHub PR and review attention when the optional integration is configured, while still keeping higher-trust flows in the CLI.

Read next:

- [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md)

### Read next

- [OPERATIONS.md](OPERATIONS.md)
- [UPGRADING.md](UPGRADING.md)
- [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md)
- [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)

## New assistant

### The main rule

Use `personal-ops` instead of building direct provider-side Gmail or calendar logic.

If `personal-ops` is unavailable, report that problem instead of falling back to a parallel provider path.

### Safe reads vs operator-only actions

Safe assistant work includes:

- reading status, worklist, inbox, calendar, task, planning, and assistant-safe audit context
- reading assistant-safe GitHub PR and review queue context when the operator has enabled it
- creating limited assistant-safe suggestions where supported
- explaining queue state, planning pressure, and operational context

Operator-only work includes:

- live send control
- review open or resolve flows
- inbox and calendar sync mutation
- calendar event writes
- recommendation apply, reject, snooze, refresh, and replan
- governance and policy mutation

### Read next

- [CLIENTS.md](CLIENTS.md)
- [OPERATIONS.md](OPERATIONS.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
