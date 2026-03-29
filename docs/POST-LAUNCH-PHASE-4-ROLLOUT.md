# Post-Launch Phase 4 Rollout

## Summary

Post-Launch Phase 4 makes `personal-ops` feel like a maintained source-first product.

Delivered in this phase:

- explicit version visibility through `personal-ops version`
- additive `service_version` in `status --json`
- console Overview version display
- `CHANGELOG.md` and `UPGRADING.md`
- `release:prep` and `release:notes` helper scripts
- `.github/workflows/release.yml` for tag-driven source-based GitHub Releases
- refreshed release, upgrade, onboarding, and roadmap docs

The official distribution model remains source checkout plus `./bootstrap`. No Homebrew, package-manager, or installer packaging was added in this phase.

## Verification

Automated verification completed successfully:

- `npm run typecheck`
- `npm test` with 138 passing tests
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`
- `npm run release:check`

Live sanity pass completed:

- `personal-ops install all --json`
- `personal-ops version`
- `personal-ops version --json`
- `personal-ops status --json`
- `personal-ops console --print-url`

Release prep dry-run verification completed from a clean temporary checkout of the current branch:

- `cd app && npm run release:prep -- --version 0.2.0 --dry-run`

That dry-run reported:

- current version: `0.1.0`
- target version: `0.2.0`
- changelog entry found
- no files changed

Live state after refresh:

- `personal-ops status --json`: `ready`
- `service_version`: `0.1.0`
- latest snapshot remained `2026-03-29T12-38-12Z`

## Release surfaces added

- `personal-ops version`
- `CHANGELOG.md`
- `UPGRADING.md`
- `app/scripts/release-prep.mjs`
- `app/scripts/release-notes.mjs`
- `.github/workflows/release.yml`
- additive version visibility in `status` and the console Overview

## Git closeout

Branch:

- `codex/post-launch-phase-4-release-distribution`

Commits:

- `87ff094` `feat(release): add source-first release workflow`
- `8040d37` `docs(release): finalize phase 4 rollout record`

Draft PR:

- [#13](https://github.com/saagpatel/personal-ops/pull/13)

## Next recommended phase

Post-Launch Phase 5: Workflow Actions and Bundles
