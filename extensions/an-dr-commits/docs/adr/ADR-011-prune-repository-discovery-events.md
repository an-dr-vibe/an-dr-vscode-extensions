# ADR-011: Prune repository discovery events

## Problem

The workspace-wide creation watcher queued every new path for filesystem inspection and repository probing. Operations such as dependency installation generated large amounts of needless work inside repositories already known to Commits.

## Decision

At repository-search depth zero, discard ordinary creation events whose paths are inside a known repository before they enter the buffered queue. Always retain creation of a `.git` directory so nested repositories remain discoverable.

## Rationale

Depth zero explicitly disables recursive directory search, so probing ordinary descendants cannot discover anything the user requested. A `.git` event is direct evidence of a repository and therefore bypasses the depth optimization, preserving ADR-008's nested-repository behavior.

## Rejected alternatives

- Narrow the filesystem glob to workspace roots; VS Code glob patterns cannot express the dynamic set of known repositories and nested `.git` exceptions cleanly.
- Ignore all events inside known repositories; that would miss a newly initialized nested repository.
- Probe first and deduplicate later; the expensive filesystem and Git work would already have occurred.
