# Post-Launch Phase 7: GitHub PR and Review Context

## Summary

Phase 7 adds GitHub as the next external context source for `personal-ops`, but keeps the integration narrow and read-first.

Primary scope:

- GitHub.com only
- PR and review queue context only
- Keychain-backed PAT auth
- explicit repository opt-in
- no GitHub write actions
- no browser mutation widening

## Delivered shape

Public additions in this phase:

- `personal-ops auth github login`
- `personal-ops auth github logout`
- `personal-ops github status`
- `personal-ops github sync now`
- `personal-ops github reviews`
- `personal-ops github pulls`
- `personal-ops github pr <owner/repo#number>`
- `GET /v1/github/status`
- `POST /v1/github/sync`
- `GET /v1/github/reviews`
- `GET /v1/github/pulls`
- `GET /v1/github/pulls/:prKey`
- assistant-safe MCP reads:
  - `github_status`
  - `github_reviews`
  - `github_pulls`
  - `github_pull_get`

Config adds a GitHub block:

- `[github]`
- `enabled = false`
- `included_repositories = []`
- `sync_interval_minutes = 10`
- `keychain_service = "personal-ops.github"`

## Implementation goals

- store and verify a GitHub PAT in Keychain
- keep one connected GitHub login per machine state
- sync only explicitly included repositories
- cache only the PR and review queue context needed for operator flow
- surface GitHub attention in status, worklist, `workflow now-next`, `workflow prep-day`, and the console

## Guardrails

- GitHub integration stays read-first
- no issues ingestion
- no GitHub write actions
- no GitHub Enterprise support
- no new browser auth scope
- no new assistant mutation scope
