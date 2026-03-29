# personal-ops

`personal-ops` is a private local control layer for your personal workflow.

It gives you one shared system for inbox state, calendar context, tasks, planning recommendations, approvals, and assistant-safe operational reads so tools like Codex or Claude can help without directly taking over your accounts.

## What Exactly It Does

`personal-ops` runs as a local service on your machine and acts as the shared source of truth for:

- Gmail and Google Calendar awareness
- tasks and task suggestions
- planning recommendations
- drafts, approvals, and review flows
- assistant-safe audit history
- shared status and worklist views for humans and assistants

In practice, that means it can:

- sync recent mailbox and calendar context into one local system
- track what needs attention
- suggest useful work like reply blocks, follow-up blocks, or prep blocks
- show assistants safe operational context
- keep higher-risk actions behind operator control

## Main Features

- Local daemon plus local database for one shared operational state
- Gmail-aware and Calendar-aware workflow context
- Task tracking, task suggestions, and planning recommendations
- Shared CLI, HTTP, and MCP access for both humans and assistants
- Operator-gated approvals, reviews, and mutation flows
- Assistant-safe audit feed with categorized recent activity
- Clear separation between safe reads and risky real-world actions

## Exciting Features

- Multiple assistants can use the same trusted workflow layer instead of each inventing their own Gmail or calendar logic
- The system can turn inbox and calendar pressure into actual planning recommendations instead of just showing raw chaos
- Assistants get useful context without getting unlimited control over your accounts
- You get a real audit trail of what the system did and why
- The whole thing runs locally, so your workflow control plane lives on your machine

## Why You Would Want To Use It

You would want `personal-ops` if you want AI help with your personal workflow but do not want to hand over unlimited power to an assistant.

It is useful when you want:

- one place that knows the current operational state
- safer AI-assisted inbox, task, and calendar workflows
- less duplicated logic across different assistants
- clearer visibility into what is happening and what needs attention
- a system that is inspectable, documented, and operator-controlled

The core idea is simple:

- assistants can help
- the operator stays in charge

## Learn More

- New machine setup: [docs/NEW-MACHINE-SETUP.md](docs/NEW-MACHINE-SETUP.md)
- Full project summary: [docs/PROGRAM-COMPLETE-SUMMARY.md](docs/PROGRAM-COMPLETE-SUMMARY.md)
- Client usage contract: [CLIENTS.md](CLIENTS.md)
- Deep system audit: [docs/2026-03-24-system-audit.md](docs/2026-03-24-system-audit.md)
