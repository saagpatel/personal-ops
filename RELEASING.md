# RELEASING

This is the practical release and maintenance checklist for `personal-ops`.

Use this when you want one repeatable path before shipping or after landing a meaningful change.

The official distribution model in this phase is source-first:

- releases are tagged as `vX.Y.Z`
- GitHub Releases publish source-based release notes
- installs and upgrades still happen through repo checkout plus `./bootstrap`
- no Homebrew, npm publish, binary packaging, or signed installer is part of this phase

## Release gates

Local full gate from `app/`:

```bash
npm run release:check
```

That runs:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`

GitHub CI baseline:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`

CI is the stable cross-platform baseline.
The local release gate is the full operator-grade check.

## Recommended local release flow

From the repo root:

1. Update to the branch you intend to ship.
2. From `app/`, run:

```bash
npm run release:check
```

3. Refresh the live install:

```bash
personal-ops install all --json
```

4. Confirm the live runtime:

```bash
personal-ops install check --json
personal-ops status --json
personal-ops doctor --deep --json
```

5. Create a fresh recovery point:

```bash
personal-ops backup create --json
```

6. Confirm browser access still opens:

```bash
personal-ops console --print-url
```

## Recurring health check

Use this for a compact ongoing check:

```bash
personal-ops health check
```

Useful variants:

```bash
personal-ops health check --deep
personal-ops health check --max-snapshot-age-hours 24
```

Behavior:

- combines local install health, daemon reachability, doctor state, and snapshot freshness
- surfaces retention pressure when prune candidates are waiting
- surfaces recovery rehearsal freshness
- exits non-zero when warnings or failures are present
- works well for recurring local automation, cron, or launchd

Recovery confidence loop:

```bash
npm run verify:recovery
```

This runs an isolated backup-and-restore rehearsal, verifies rescue snapshot behavior, checks prune logic, and only then refreshes the local recovery rehearsal success stamp.

## When to stop and investigate

Do not treat a build as releasable if any of these are true:

- `npm run release:check` fails
- `personal-ops install check` is not `ready`
- `personal-ops doctor --deep` is not `ready`
- `personal-ops health check` reports attention needed or degraded state
- no recent recovery snapshot exists
- no recent successful recovery rehearsal exists

## Version and release prep

Current version surface:

```bash
personal-ops version
personal-ops version --json
```

Release prep helpers from `app/`:

```bash
npm run release:prep -- --version X.Y.Z --dry-run
npm run release:prep -- --version X.Y.Z
npm run release:notes -- --version X.Y.Z
```

Rules:

- `app/package.json` is the canonical version source
- release prep requires a clean worktree
- the target version must be newer than the current version
- `CHANGELOG.md` must already contain a section for the target version
- release notes are extracted from the matching `CHANGELOG.md` section

## Tagged release flow

Cut source-first releases only from clean `main`.

Recommended release sequence:

1. run `npm run release:check`
2. run `npm run release:prep -- --version X.Y.Z`
3. review `CHANGELOG.md`
4. commit the version bump and changelog
5. create tag `vX.Y.Z`
6. push `main` and the tag
7. let `.github/workflows/release.yml` publish the GitHub Release

The release workflow runs the stable CI subset:

- `npm ci`
- `npm run release:check:ci`
- `npm run release:notes -- --version X.Y.Z`

## Upgrade path

Use [UPGRADING.md](UPGRADING.md) for the official in-place upgrade flow.

Short version:

1. `personal-ops backup create --json`
2. update the repo to the intended tag or branch
3. rerun `./bootstrap`
4. rerun `personal-ops install check --json`
5. rerun `personal-ops doctor --deep --json`
6. rerun `personal-ops console --print-url`

## Rollback posture

If a change lands and the live install behaves unexpectedly:

1. rerun `personal-ops install all`
2. rerun `personal-ops doctor --deep`
3. inspect the latest snapshot
4. restore from a known-good snapshot only if recovery is actually needed

Remember:

- restore is recovery or intentional migration, not sync
- secrets stay machine-local
- cross-machine restore still requires explicit intent
