# RELEASING

This is the practical release and maintenance checklist for `personal-ops`.

Use this when you want one repeatable path before shipping or after landing a meaningful change.

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
