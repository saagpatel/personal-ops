# Coordination Handoff Acceptance

Status: Draft read-only acceptance matrix
Last reviewed: 2026-05-04

This document defines the fixture-backed acceptance check for Codex-to-ChatGPT handoff packets.

The acceptance check answers one question:

```text
Do the handoff packet contracts still hold across representative scenarios?
```

It does not inspect live external systems, send packets, write state, update Notion, create bridge-db records, post notifications, or mutate git.

## Command

Run:

```bash
personal-ops coordination handoff-test
```

For structured output:

```bash
personal-ops coordination handoff-test --json
```

## Fixture Matrix

The acceptance suite uses synthetic snapshots for:

- `green-baseline-verification`: clean green baseline packet
- `diff-with-classification`: diff packet with classification and verification prompts
- `dirty-repo-yellow`: degraded repo posture represented in a yellow packet
- `source-unavailable`: unavailable source represented in a yellow packet
- `health-attention-needed`: attention-needed health represented in a yellow packet
- `notion-deferred`: Notion remains a deferred lane boundary

## Required Outcomes

Acceptance passes only when:

- each scenario produces the expected coordination mode
- each generated packet passes the briefing self-check
- diff scenarios include classification-derived prompts
- baseline scenarios do not require diff classification
- yellow scenarios preserve current health and posture facts
- Notion deferred language remains a boundary, not a source-read request

## Boundaries

Do not turn this into:

- a dashboard
- a packet history store
- a bridge-db writer
- a notification-hub trigger
- a Notion synchronizer
- a replacement for Codex local verification

The acceptance suite is a regression guard. Real handoffs still require local verification and user approval before mutation.
