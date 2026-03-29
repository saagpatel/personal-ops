# personal-ops New Machine Setup

This guide is the practical “how do I get this running on another Mac?” version of the project docs.

For the main onboarding path, start with [START-HERE.md](../START-HERE.md).

For the full operational runbook, use [OPERATIONS.md](../OPERATIONS.md).

## What moves to the new machine

You should move:

- the repo itself
- the source code in `app/src`
- the tests in `app/test`
- the package files in `app/package.json`, `app/package-lock.json`, and `app/tsconfig.json`
- the root docs like `README.md` and `CLIENTS.md`
- the docs in `docs/`

You should **not** move live machine state or secrets:

- `~/Library/Application Support/personal-ops/personal-ops.db`
- `~/Library/Application Support/personal-ops/local-api-token`
- `~/Library/Application Support/personal-ops/assistant-api-token`
- `~/Library/Logs/personal-ops/`
- the Gmail refresh token stored in Keychain
- any real OAuth credential JSON with populated secrets unless you intentionally want to reuse that Google Cloud client

The new machine should create its own runtime state locally.

Default supported model:

- bootstrap fresh on the new machine
- use backup restore only when you intentionally mean to migrate or recover state
- there is no live sync or merge behavior between two machines

## Recommended clone location

Clone the repo to:

- `~/.local/share/personal-ops`

That matches the default app path used by the system.

## Install steps

1. Clone the repo.
2. Run `./bootstrap`.
3. Fill in your mailbox and OAuth config.
4. Authenticate Gmail and Google Calendar.
5. Finish with `personal-ops doctor --deep`.

## Step by step

### 1. Clone the repo

```bash
mkdir -p ~/.local/share
git clone <your-private-repo-url> ~/.local/share/personal-ops
cd ~/.local/share/personal-ops/app
```

### 2. Run bootstrap

From the repo root:

```bash
./bootstrap
```

That one command:

- installs app dependencies
- builds the TypeScript app
- creates the default local runtime files
- installs the CLI wrapper, daemon wrapper, Codex MCP wrapper, and Claude MCP wrapper
- installs and reloads the LaunchAgent
- runs a local install check

It also creates the default local files under:

- `~/.config/personal-ops/config.toml`
- `~/.config/personal-ops/policy.toml`
- `~/.config/personal-ops/gmail-oauth-client.json`
- `~/Library/Application Support/personal-ops/`
- `~/Library/Logs/personal-ops/`

## 3. Fill in config

Edit:

- `~/.config/personal-ops/config.toml`

The key fields to review first are:

- `gmail.account_email`
- `auth.oauth_client_file`

By default, the system expects:

- `~/.config/personal-ops/gmail-oauth-client.json`

## 4. Add OAuth client credentials

Create or reuse a Google Cloud Desktop OAuth client with the APIs you need enabled.

Put the client JSON at:

- `~/.config/personal-ops/gmail-oauth-client.json`

Then run:

```bash
personal-ops auth gmail login
personal-ops auth google login
```

Use the Gmail and Calendar account you want this machine to operate against.

Important:

- `config.toml` mailbox and the signed-in Google account should match
- if install-check says the OAuth file is placeholder, malformed, or not a Desktop OAuth client, replace it before continuing
- if deep doctor later says the grant is stale or missing required access, rerun both auth login commands
- if you intentionally restore a snapshot from another machine later, use `--allow-cross-machine` and rerun local auth checks on this Mac

## 5. Verify the install

```bash
personal-ops install check
personal-ops status
personal-ops doctor --deep
personal-ops worklist
```

Healthy expected outcomes:

- daemon reachable
- schema matches expected version
- mailbox setup recognized
- calendar checks pass if Google auth is complete
- secret and auth findings are either clean or give explicit recovery steps

## Beginner checklist

If you just want the shortest path:

1. clone repo to `~/.local/share/personal-ops`
2. run `./bootstrap`
3. fill in `~/.config/personal-ops/config.toml`
4. add `~/.config/personal-ops/gmail-oauth-client.json`
5. run `personal-ops auth gmail login`
6. run `personal-ops auth google login`
7. run `personal-ops doctor --deep`

## Advanced manual install

If you want to rerun only part of the install flow later:

```bash
personal-ops install all
personal-ops install wrapper --kind cli
personal-ops install wrapper --kind daemon
personal-ops install wrapper --kind mcp --assistant codex
personal-ops install wrapper --kind mcp --assistant claude
personal-ops install launchagent
personal-ops install check
```

## What to read next

- `START-HERE.md` for the main documentation entry point
- `OPERATIONS.md` for the operational runbook
- `CLIENTS.md` for the assistant/client contract
- `docs/PROGRAM-COMPLETE-SUMMARY.md` for the full project story
