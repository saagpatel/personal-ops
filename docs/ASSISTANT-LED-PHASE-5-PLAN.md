# Assistant-Led Phase 5 Plan

## Goal

Broaden the existing read-first Google context only where it materially improves assistant execution.

## Scope

Phase 5 adds:

- narrow cached Google Sheets preview support inside the existing Drive scope
- richer related-file grouping in the current Drive integration
- `personal-ops drive sheet <fileId>`
- `GET /v1/drive/sheets/:fileId`
- assistant-safe MCP `drive_sheet_get`
- additive `related_files` on workflow and meeting-prep detail payloads while keeping `related_docs` stable for compatibility

## Guardrails

- reuse the existing `[drive]` scope model
- reuse the existing Google auth flow and token store
- stay read-first
- no Sheets writes
- no Docs writes
- no Slides extraction
- no Shared Drives support
- no browser-safe mutation expansion

## Success Target

The operator should see more useful Google context in the places that already matter:

- meeting prep packets
- day-start and now-next workflows
- worklist detail
- Drive status and targeted file inspection

Without adding:

- a standalone Sheets queue
- a broad Drive browser
- any new high-trust Google mutation path
