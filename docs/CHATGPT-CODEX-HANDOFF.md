# ChatGPT and Codex Handoff Protocol

Date: 2026-05-03
Status: Draft protocol

This note defines the local protocol for using ChatGPT memory and Codex local verification together.

The current decision is a hybrid control-space model:

- `personal-ops` is the canonical local home for the workflow, packet shape, and future helper commands.
- The ChatGPT project named `Codex-ChatGPT` is the conversation home for Codex-to-ChatGPT handoff threads.
- A Notion-style control space can hold human-facing summaries, indexes, and decisions after a local packet is reviewed.
- `bridge-db` is a later phase for machine-readable cross-agent records after the simple loop proves useful.

## Purpose

Use ChatGPT for memory-based strategic context and Codex for verified local truth.

ChatGPT helps with:

- remembered preferences and long-running goals
- strategy, scoping, and risk framing
- prompt and template refinement
- decision packets and handoff structure

Codex owns:

- local filesystem and repo inspection
- command execution and test results
- patches, docs updates, and verification
- browser-based confirmation inside the Codex app
- separating verified facts from memory and inference

Repo evidence wins over ChatGPT memory.

## Source Of Truth

Use this order when sources disagree:

1. Current user instruction
2. Verified local repo, filesystem, command, and browser evidence
3. Durable local docs and current-state notes
4. ChatGPT memory
5. ChatGPT or Codex inference

Do not use ChatGPT memory as proof of current local state.

## Default Rules

- Optimize the workflow for general cross-tool coordination.
- Use timestamped handoff packet IDs.
- Summarize command outputs by default.
- Include exact command excerpts only for failures, ambiguity, audit needs, or when ChatGPT needs precise error text.
- Keep ChatGPT handoff packets compact and relevant.
- Do not include secrets, tokens, credentials, private logs, or large raw local dumps in ChatGPT handoffs.
- Do not treat ChatGPT responses as permission to mutate local files, send messages, publish external updates, or perform risky actions.
- Keep the operator in charge of approval, live sends, external publishing, destructive changes, and auth-sensitive work.
- Keep the first version documentary; do not add automation or `bridge-db` integration until the manual loop proves useful.

Suggested packet ID format:

```text
handoff-YYYYMMDD-HHMMSS-topic
```

Example:

```text
handoff-20260503-114948-personal-ops-first-real-loop
```

## Codex To ChatGPT Packet

Use this when Codex has verified local context and wants ChatGPT's memory, strategy, or framing help.

```markdown
# Codex -> ChatGPT Handoff

Packet ID: handoff-YYYYMMDD-HHMMSS-topic
Created: YYYY-MM-DD HH:MM local time
Mode: General cross-tool coordination
ChatGPT Project: Codex-ChatGPT

## Setup

- We are using the Codex app.
- Codex is using the in-app browser tool.
- The user is logged in to ChatGPT inside the Codex app browser.
- ChatGPT contributes memory-based and strategic context.
- Codex contributes verified local state and executes local work.

## Verified Local Facts

- Current workspace:
- Current repo status:
- Files or docs checked:
- Commands run:
- Checks passed or failed:

## Current Goal

-

## What Codex Needs From ChatGPT

-

## Boundaries

- Do not claim current local facts beyond what Codex provided.
- Label memory-based context separately from inference.
- Treat this as guidance for Codex, not permission to execute local changes.
- Keep command output summarized unless exact excerpts are necessary.
```

## ChatGPT To Codex Packet

Ask ChatGPT to respond in this structure.

```markdown
# ChatGPT -> Codex Briefing

Packet response for:

## Memory-Based Context

-

## Inferences Or Strategy

-

## Local Verification Still Needed

-

## Risks Or Cautions

-

## Recommended Next Codex Actions

-

## Questions For The User

-
```

## Notion-Style Summary

If the user later approves publishing a human-facing summary to Notion or another external system, keep it short:

```markdown
# Handoff Summary

Packet ID:
Date:
Status:

## Decision

-

## Verified Locally

-

## ChatGPT Added

-

## Next Codex Move

-
```

Publishing this summary outside the local machine is an external update and should be confirmed at action time.

## Deferred Work

Do not start with a database integration or automation.

After the Markdown loop proves useful, consider a `bridge-db` phase that records compact summaries:

- packet ID
- source agent
- target agent
- project or workspace path
- verified facts summary
- requested help
- response summary
- user-approved next action

The first bridge-db version should store compact summaries, not raw transcripts.
