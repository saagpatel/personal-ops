# Post-Launch Phase 8 Rollout

## Summary

Phase 8 adds read-first Google Docs and Drive metadata context to `personal-ops`:

- explicit Drive and Docs scope through `config.toml`
- reused Google auth flow with additive Docs and Drive scopes
- Drive status, sync, files, and doc detail reads
- assistant-safe MCP Drive reads
- additive Drive context in `status`, meeting prep, `workflow prep-day`, `workflow now-next`, and the console

The trust model stays intentionally narrow:

- Google Docs plus Drive metadata only
- explicit opt-in scope only
- explicit links first, with a small recent-doc fallback
- read-first only
- no Google write actions
- no new browser mutation scope

## Verification

Repo verification passed:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`
- `npm run verify:all`

Current test count at closeout:

- `154` passing tests

`verify:all` covered:

- `npm run typecheck`
- `npm test`
- `npm run verify:smoke`
- `npm run verify:full`
- `npm run verify:console`
- `npm run verify:launchagent`
- `npm run verify:recovery`

## Live Sanity

Live Drive and Docs sanity depends on an operator config with in-scope files or folders plus the required Google Drive metadata and Docs readonly scopes.

Live operator checks passed after refreshing the installed daemon with `personal-ops install all --json`:

- `personal-ops drive status`
- `personal-ops drive sync now`
- `personal-ops drive files`
- `personal-ops workflow prep-meetings --today`
- `personal-ops workflow prep-day`
- `personal-ops status --json`
- `personal-ops console --print-url`

Live setup path for the operator:

- `personal-ops auth google login`
- `personal-ops drive sync now`
- `personal-ops drive status`
- `personal-ops drive files`
- `personal-ops drive doc <fileId>`
- `personal-ops workflow prep-meetings --today`
- `personal-ops workflow prep-day`
- `personal-ops status --json`
- `personal-ops console --print-url`

Observed live environment note:

- the real Google grant on this machine is still missing:
  - `https://www.googleapis.com/auth/drive.metadata.readonly`
  - `https://www.googleapis.com/auth/documents.readonly`
- because of that, a meaningful live `personal-ops drive doc <fileId>` pass still requires rerunning `personal-ops auth google login` and accepting the new consent screen before Drive is enabled in `config.toml`
- the live config was updated only with the new safe default `[drive]` block and left `enabled = false`

Observed product shape at closeout:

- linked docs are discovered from calendar descriptions, task notes, and draft bodies first
- recent synced docs can appear as a small fallback context layer when no explicit link exists
- status JSON includes an additive `drive` block
- meeting prep and day-start workflows can attach related docs without widening mutation scope
- the console can surface linked docs and open their external Google URLs

## Closeout

Branch:

- `codex/post-launch-phase-8-drive-docs-context`
- commit: `b762da1`
- draft PR: <https://github.com/saagpatel/personal-ops/pull/17>

Next recommended phase:

- a future context expansion should stay narrow, explicit, and trust-safe instead of turning `personal-ops` into a broad document browser
