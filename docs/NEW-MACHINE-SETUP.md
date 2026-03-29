# personal-ops New Machine Setup

This guide is the practical “how do I get this running on another Mac?” version of the project docs.

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
- any real OAuth credential JSON with populated secrets unless you intentionally want to reuse that Google Cloud client

The new machine should create its own runtime state locally.

## Recommended clone location

Clone the repo to:

- `~/.local/share/personal-ops`

That matches the default app path used by the system.

## Install steps

1. Clone the repo.
2. Install app dependencies.
3. Build the TypeScript app.
4. Let `personal-ops` generate its default runtime files.
5. Fill in your mailbox and OAuth config.
6. Authenticate Gmail and Google Calendar.
7. Optionally install the local CLI and MCP wrappers.
8. Optionally install the LaunchAgent so the daemon stays up across logins.

## Step by step

### 1. Clone the repo

```bash
mkdir -p ~/.local/share
git clone <your-private-repo-url> ~/.local/share/personal-ops
cd ~/.local/share/personal-ops/app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the app

```bash
npm run build
```

### 4. Generate the default local runtime files

Run any CLI command once. A simple choice is:

```bash
node dist/src/cli.js status
```

That creates the default local files under:

- `~/.config/personal-ops/config.toml`
- `~/.config/personal-ops/policy.toml`
- `~/.config/personal-ops/gmail-oauth-client.json`
- `~/Library/Application Support/personal-ops/`
- `~/Library/Logs/personal-ops/`

## 5. Fill in config

Edit:

- `~/.config/personal-ops/config.toml`

The key fields to review first are:

- `gmail.account_email`
- `auth.oauth_client_file`

By default, the system expects:

- `~/.config/personal-ops/gmail-oauth-client.json`

## 6. Add OAuth client credentials

Create or reuse a Google Cloud Desktop OAuth client with the APIs you need enabled.

Put the client JSON at:

- `~/.config/personal-ops/gmail-oauth-client.json`

Then run:

```bash
node dist/src/cli.js auth gmail login
node dist/src/cli.js auth google login
```

Use the Gmail and Calendar account you want this machine to operate against.

## 7. Optional local CLI wrapper

If you want `personal-ops` available as a normal shell command:

```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/personal-ops <<'EOF'
#!/bin/zsh
exec node "$HOME/.local/share/personal-ops/app/dist/src/cli.js" "$@"
EOF
chmod +x ~/.local/bin/personal-ops
```

Make sure `~/.local/bin` is on your shell `PATH`.

## 8. Optional MCP wrapper for assistants

If you want Codex to call the MCP bridge:

```bash
mkdir -p ~/.codex/bin
cat > ~/.codex/bin/personal-ops-mcp <<'EOF'
#!/bin/zsh
exec node "$HOME/.local/share/personal-ops/app/dist/src/mcp-server.js"
EOF
chmod +x ~/.codex/bin/personal-ops-mcp
```

You can create a similar wrapper for any other assistant client.

## 9. Optional LaunchAgent for always-on daemon mode

Create:

- `~/Library/LaunchAgents/com.d.personal-ops.plist`

With contents like:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.d.personal-ops</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/env</string>
      <string>node</string>
      <string>/Users/REPLACE_ME/.local/share/personal-ops/app/dist/src/daemon.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/REPLACE_ME/Library/Logs/personal-ops/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/REPLACE_ME/Library/Logs/personal-ops/launchd.err.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/REPLACE_ME/.local/share/personal-ops/app</string>
  </dict>
</plist>
```

Replace `REPLACE_ME` with the local macOS username on that machine.

Then load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.d.personal-ops.plist
launchctl kickstart -k gui/$(id -u)/com.d.personal-ops
```

## 10. Verify the install

If you created the CLI wrapper:

```bash
personal-ops status
personal-ops doctor --deep
personal-ops worklist
```

If you did not create the wrapper:

```bash
node dist/src/cli.js status
node dist/src/cli.js doctor --deep
node dist/src/cli.js worklist
```

Healthy expected outcomes:

- daemon reachable
- schema matches expected version
- mailbox setup recognized
- calendar checks pass if Google auth is complete

## Beginner checklist

If you just want the shortest path:

1. clone repo to `~/.local/share/personal-ops`
2. run `npm install`
3. run `npm run build`
4. run `node dist/src/cli.js status`
5. fill in `~/.config/personal-ops/config.toml`
6. add `~/.config/personal-ops/gmail-oauth-client.json`
7. run `node dist/src/cli.js auth gmail login`
8. run `node dist/src/cli.js auth google login`
9. run `node dist/src/cli.js doctor --deep`

## What to read next

- `README.md` for the plain-English overview
- `CLIENTS.md` for the assistant/client contract
- `docs/PROGRAM-COMPLETE-SUMMARY.md` for the full project story
