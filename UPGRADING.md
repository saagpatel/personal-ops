# UPGRADING

`personal-ops` currently ships as a source-first product.

The official upgrade path is:

1. Create a fresh recovery point:

```bash
personal-ops backup create --json
```

2. Update the repo to the intended tag or branch.
3. From the repo root, rerun:

```bash
./bootstrap
```

4. Confirm the local install:

```bash
personal-ops install check --json
personal-ops doctor --deep --json
```

5. Confirm browser access still opens:

```bash
personal-ops console --print-url
```

6. If you use the optional macOS desktop shell, refresh it after the upgrade:

```bash
personal-ops install desktop
personal-ops desktop status
```

Important notes:

- Releases are tagged and documented, but not packaged as installers in this phase.
- Upgrades are in-place source upgrades.
- The optional macOS desktop shell remains a locally built unsigned `.app`.
- `app/package.json` is the canonical product version source.
- Use `cd /Users/d/.local/share/personal-ops/app && npm run release:check` before treating a branch as releasable.
- Restore remains manual and CLI-only.
