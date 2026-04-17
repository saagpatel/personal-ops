# Changelog

This changelog tracks operator-facing releases for the source-first `personal-ops` product.

## [Unreleased]

- Fixes the duplicate `inbox` CLI registration on the current branch.
- Makes app builds clean `dist/` before compiling so verification reflects the real source tree.
- Adds a durable current-state checkpoint note for resume-work context.
- Moves older phase-by-phase planning artifacts under `docs/archive/` to keep the active docs surface smaller and clearer.

## [0.2.0] - 2026-04-14

- First official source-first release for `personal-ops`.
- Adds explicit version visibility with `personal-ops version`, additive `service_version` in `status`, and console Overview version display.
- Adds release helper scripts for release prep and release-note extraction.
- Adds a GitHub tag workflow that publishes source-based GitHub Releases from `CHANGELOG.md`.
- Documents the official upgrade path through `./bootstrap`, release checks, and post-upgrade validation.
