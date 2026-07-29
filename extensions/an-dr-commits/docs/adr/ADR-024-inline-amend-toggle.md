# ADR-024: Inline amend toggle

## Problem

The uncommitted-changes footers in the main Files Panel and Activity Bar sidebar exposed
amend through a dropdown beside the Commit button. That made a common workflow slower and
ambiguous: users had to open a menu, and it was not visible whether the next commit action
would amend or create a new commit.

The amend flow also needs access to the previous commit's full message, not only the
subject rendered in the commit table.

## Decision

Render amend as an icon-only toggle directly to the right of the Commit button in both
commit footers. When the toggle is on, Commit sends `amend: true`; when it is off, Commit
sends `amend: false`.

If the message textarea is empty when amend is enabled, the webview requests the full HEAD
commit message from the backend and inserts it into the textarea. If the textarea already
has text, the text is preserved and a temporary `Replace message with previous commit`
button appears between the textarea and Commit row. That temporary button disappears when
the textarea receives focus or amend is disabled, and clicking it replaces the textarea
with the full previous commit message.

## Rationale

The toggle makes amend state visible at the point of action and keeps the footer compact.
Fetching the message from the backend via `loadPreviousCommitMessage` keeps Git access in
the Node side of the extension and preserves multi-line commit messages. The tab and
sidebar use their own existing webview protocols, but both route to
`DataSource.getPreviousCommitMessage()`.

## Rejected alternatives

- Keep amend in the dropdown. This hides the active amend state and keeps the extra click.
- Use the commit table's rendered message. That only provides the subject and can be stale
  or unavailable depending on the current graph projection.
- Replace typed text immediately when enabling amend. That risks destroying a drafted
  message without an explicit replacement action.
