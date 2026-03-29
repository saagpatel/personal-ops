# Post-Launch Phase 4 Plan

## Summary

Phase 4 makes `personal-ops` feel like a maintained source-first product.

This phase adds:

- explicit version visibility
- tagged release and release-note workflow
- an official upgrade path
- durable release docs and closeout memory

Locked defaults:

- official distribution remains source checkout plus `./bootstrap`
- release identity uses SemVer tags in the form `vX.Y.Z`
- `app/package.json` remains the canonical version source
- no Homebrew, npm publish, binary packaging, or signed installer in this phase
- the first polished release after this phase is targeted as `v0.2.0`

## Implementation

- add a shared version helper and `personal-ops version`
- add additive `service_version` in `status --json`
- show version in the console Overview
- add `CHANGELOG.md` and `UPGRADING.md`
- add `npm run release:prep -- --version X.Y.Z`
- add `npm run release:notes -- --version X.Y.Z`
- add `.github/workflows/release.yml` for tag-based GitHub Releases
- update release, operations, onboarding, and roadmap docs

## Verification

Required automated verification:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`

Required live sanity:

- `personal-ops version`
- `personal-ops version --json`
- `personal-ops status --json`
- `personal-ops console --print-url`
- `cd /Users/d/.local/share/personal-ops/app && npm run release:check`
- dry-run `npm run release:prep -- --version 0.2.0 --dry-run`

## Next Recommended Phase

Post-Launch Phase 5: Workflow Actions and Bundles
