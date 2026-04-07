# Assistant-Led Phase 14 Plan

## Title

Desktop Install Reliability and CI Stability

## Summary

Phase 14 hardens the local launcher and desktop install path now that the desktop shell is explicitly macOS-only.

The focus of this phase is operational reliability:

- repair wrapper drift without forcing a full reinstall
- make install check, doctor, and desktop status agree on what is stale
- keep CI aligned with the macOS-only contract
- avoid expanding the desktop product surface or trust boundaries

## Delivered Shape

- add wrapper provenance to the install manifest
- add `personal-ops install wrappers`
- surface wrapper drift distinctly in install check and doctor
- separate launcher repair from desktop reinstall in desktop status and desktop open
- keep desktop tests platform-aware and CI-safe
- update roadmap and support-contract docs

## Guardrails

- no new HTTP or MCP APIs
- no browser mutation expansion
- no cross-platform desktop expansion
- no change to send, approval, auth, restore, or ranking behavior
