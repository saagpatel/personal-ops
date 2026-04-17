# Post-Launch Phase 8: Google Docs and Drive Metadata Context

## Summary

Phase 8 adds Google Docs context plus narrow Drive metadata as the next read-first context layer for `personal-ops`.

Primary scope:

- Google Docs text context plus Drive file metadata only
- explicit opt-in scope through `config.toml`
- reuse the existing Google auth flow and refresh token
- explicit links first, with a small recent-doc fallback
- no write actions
- no new browser mutations

## Delivered shape

Public additions in this phase:

- `[drive]` config block:
  - `enabled = false`
  - `included_folders = []`
  - `included_files = []`
  - `sync_interval_minutes = 30`
  - `recent_docs_limit = 10`
- `personal-ops drive status`
- `personal-ops drive sync now`
- `personal-ops drive files`
- `personal-ops drive doc <fileId>`
- `GET /v1/drive/status`
- `POST /v1/drive/sync`
- `GET /v1/drive/files`
- `GET /v1/drive/docs/:fileId`
- assistant-safe MCP reads:
  - `drive_status`
  - `drive_files`
  - `drive_doc_get`

## Implementation goals

- reuse the existing Google mailbox identity and refresh token
- sync only explicitly included folders, explicitly included files, and descendants of included folders
- cache only the Drive metadata and Google Docs text context needed for operator guidance
- discover relevant docs from explicit stored links first
- enrich meeting prep, day-start guidance, and console detail without creating a new Drive queue

## Guardrails

- Google Docs plus Drive metadata only
- read-first only
- no Sheets or Slides support
- no Shared Drives support
- no Google write actions
- no standalone Drive worklist items
- no new browser mutation scope
