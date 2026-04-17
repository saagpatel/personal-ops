# Post-Launch Phase 7 Rollout

## Summary

Phase 7 adds narrow GitHub PR and review context to `personal-ops`:

- PAT-based GitHub auth stored in Keychain
- explicit repository opt-in through `config.toml`
- daemon-managed GitHub sync
- GitHub status, reviews, pulls, and PR detail reads
- additive GitHub context in status, worklist, `workflow now-next`, `workflow prep-day`, and the console

The trust model stays intentionally narrow:

- GitHub.com only
- PR and review queue context only
- read-first only
- no GitHub write actions
- no browser mutation widening
- no assistant mutation widening

## Verification

Repo verification passed:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Current test count at closeout:

- `149` passing tests

`verify:all` covered:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`

## Live Sanity

Live GitHub sanity depends on an actual GitHub PAT plus explicit repository opt-in in the operator config. The Phase 7 code paths were verified end to end through the focused test coverage and the full local verification stack.

Live operator checks passed after refreshing the install:

- `personal-ops workflow now-next`
- `personal-ops workflow prep-day`
- `personal-ops status --json`
- `personal-ops console --print-url`

GitHub-specific live setup path for the operator:

- `personal-ops auth github login`
- `personal-ops github sync now`
- `personal-ops github status`
- `personal-ops github reviews`
- `personal-ops github pulls`
- `personal-ops github pr <owner/repo#number>`

Observed product shape at closeout:

- GitHub items are now eligible to outrank governance noise in healthy `workflow now-next`
- status JSON includes an additive `github` block
- the console Overview can surface GitHub attention when configured
- worklist detail supports GitHub pull request targets with exact CLI handoff

## Closeout

Branch:

- `codex/post-launch-phase-7-github-context`

Next recommended phase:

- a broader context phase only if GitHub PR and review context proves high-signal without adding too much operator noise
