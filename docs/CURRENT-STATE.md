# Current State

Date: 2026-05-04
Status: Stable on `main`; Operator Inbox, bridge activity, wrappers, desktop shell, ChatGPT/Codex handoff docs, and the read-only Coordination Snapshot contract are merged and verified.

This note is the resume checkpoint for `personal-ops`. It supersedes the older April checkpoint that still described Operator Inbox as an in-progress branch.

## What changed recently

### Operator Inbox is now on main

- added a typed `OperatorInboxReport` contract for priority, state, source ownership, safe actions, freshness, confidence, and evidence
- added the read-only Operator Inbox model in `app/src/service/operator-inbox.ts`
- wired the report through service, HTTP, CLI, MCP, and the browser console
- kept external systems visible as source states rather than treating unavailable reads as fatal
- added external adapters for bridge-db, notification-hub, GitHub Repo Auditor portfolio truth, and Notion project snapshots
- split high-churn service tests into narrower focused files so future service work is easier to verify

### Bridge and external-source truthfulness was hardened

- fixed Operator Inbox bridge source state so unavailable bridge reads are not reported as available
- repaired bridge activity reads from bridge-db structured MCP results
- fixed the daemon bridge-db `uv` launch path so live runtime reads use the stable local toolchain path
- kept bridge-db as an external source of coordination truth, not a personal-ops-owned data store

### Local install and desktop surfaces were refreshed

- wrapper provenance now points at the current checkout
- CLI, daemon, Codex MCP, and Claude MCP wrappers are installed and current
- the macOS desktop shell is installed and matches the current checkout
- the LaunchAgent is loaded and points at the installed daemon wrapper

### ChatGPT and Codex handoff protocol was added

- added `docs/CHATGPT-CODEX-HANDOFF.md` for compact, verified Codex-to-ChatGPT packets
- added `docs/CODEX-CHATGPT-MACHINE-SNAPSHOT.md` to orient ChatGPT before cross-project strategy asks
- added `docs/CROSS-PROJECT-COORDINATION.md` to preserve sibling-system ownership boundaries
- added `docs/COORDINATION-SNAPSHOT-SCHEMA.md` plus `personal-ops coordination snapshot` for a derived, read-only handoff lens
- linked that protocol from `START-HERE.md`
- kept ChatGPT advice explicitly downstream of verified local evidence
- kept mutation, send, publish, and auth-sensitive actions under explicit operator approval

## Current repo posture

`personal-ops` is currently in a strong maintenance-and-iteration state:

- `main` is aligned with `origin/main`
- latest published handoff/coordination commit is `66b8b42 docs: add cross-project coordination contract`
- the assistant-led delivery track is complete through Phase 38
- Operator Home Phase 1 is merged
- Operator Inbox foundations are merged
- bridge activity and external-source truthfulness fixes are merged
- the repo remains a local-first product baseline with CLI, daemon, HTTP API, MCP bridge, browser console, optional desktop shell, and health/recovery workflows

## Live verification snapshot

Checked on 2026-05-03 at 19:36 PDT:

- `personal-ops install check --json`: `ready`, `62 pass / 0 warn / 0 fail`
- `personal-ops health check --deep --json`: `ready`, `6 pass / 0 warn / 0 fail`
- `personal-ops inbox operator --json`: Operator Inbox generated successfully and reported bridge-db, notification-hub, repo-auditor, and Notion sources as available
- `personal-ops coordination snapshot --json`: available as the read-only cross-project handoff lens; it reports Notion as intentionally deferred for this lane

Important live details from that check:

- latest recovery snapshot: `2026-05-03T09-02-43Z`, about 17.6 hours old at check time
- recovery rehearsal: last successful run was via `npm run verify:recovery`
- deep doctor: healthy
- daemon: reachable
- desktop app: installed and current for checkout `d8e9711a`
- wrapper Node path: `/Users/d/.local/share/mise/installs/node/24.14.0/bin/node`

## Current operator signals

Operator Inbox is healthy, but it is surfacing real work:

- assistant-prepared work is ready for review
- outbound draft groups are still send-gated and require operator review
- local drafts are waiting for review
- Notion and repo-auditor signals are available but may be stale until those sibling systems refresh their own snapshots

These are operator/workflow signals, not repo health failures.

## Related system state

At the time of this checkpoint:

- `/Users/d/Projects/bridge-db` is clean and aligned with `origin/main`
- `/Users/d/Projects/GithubRepoAuditor` is clean and aligned with `origin/main`
- `/Users/d/Projects/notification-hub` is clean and aligned with `origin/main`
- `/Users/d/Notion` is intentionally handled in a separate Notion lane and should not be pulled into this coordination-snapshot implementation pass

## What to read first when resuming

If you need current truth:

- `README.md`
- `START-HERE.md`
- `docs/CHATGPT-CODEX-HANDOFF.md`
- `docs/CROSS-PROJECT-COORDINATION.md`
- `docs/COORDINATION-SNAPSHOT-SCHEMA.md`
- this file

If you need architecture and operating contracts:

- `ARCHITECTURE.md`
- `CLIENTS.md`
- `OPERATIONS.md`
- `docs/AUTOMATIONS.md`

If you need the historical implementation trail:

- `docs/ASSISTANT-LED-HISTORY-SUMMARY.md`
- `docs/archive/README.md`

## Current product direction

The next build direction is no longer emergency cleanup. The current product direction is to improve the operator-facing layer while preserving sibling-system ownership boundaries.

What is already true:

- the repo has a stable verified baseline
- Operator Home and Operator Inbox are both present on `main`
- external systems are read through adapters and source-state summaries
- bridge-db remains the cross-agent bridge, while `personal-ops` remains the operator-facing hub
- send-adjacent and external mutations remain gated by explicit operator approval
- docs now include a first draft of the Codex-to-ChatGPT handoff protocol
- docs now include a cross-project coordination contract for the five-project local operating layer
- the first coordination snapshot surface is read-only and does not write to sibling systems

What that means for the next session:

- build on the merged Operator Home and Operator Inbox surfaces
- keep external-system ownership boundaries intact
- prefer small read-model, formatter, and operator-flow improvements over broad rewrites
- use `personal-ops coordination snapshot --json` as the compact handoff input before asking ChatGPT for cross-tool strategy
- use `npm --prefix app run release:check:ci`, `personal-ops health check --deep --json`, and `personal-ops inbox operator --json` as the primary confidence path for changes near the operator surface

## Suggested next focus

Good next-session starting points:

- harden Operator Inbox outcome tracking and noise controls
- make stale external snapshots clearer without marking the whole inbox unhealthy
- refine Decision Console and evidence-card surfaces behind the existing Operator Inbox contract
- continue extracting high-churn code out of `app/src/service.ts` only behind compatibility facades
- run a recovery rehearsal when it becomes stale enough to matter, using `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`
