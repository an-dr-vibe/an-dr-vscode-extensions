# ADR-018: Offline diff syntax highlighting

## Problem

The full diff panel renders file contents as plain text, which makes changes in source files harder to scan. The extension must support common programming and configuration languages without network access or a general-purpose web bundler.

## Decision

Use the browser build of highlight.js from `@highlightjs/cdn-assets`, package its common-language build plus selected additional major-language grammars into a tab-only media asset, and detect the grammar from the changed file path. Highlight each complete file before projecting it into unified or split diff rows; unsupported files remain escaped plain text, and Raw mode keeps its existing diff-oriented rendering.

## Rationale

Full-file highlighting preserves multi-line language constructs. A local browser asset keeps diff rendering synchronous and offline, while loading it only in the editor-tab webview avoids adding work to the extension host or Activity Bar sidebar. Explicit path detection prevents unreliable automatic language guesses and makes the supported set auditable.

## Rejected alternatives

- Shipping every highlight.js grammar would substantially increase the extension asset size for little practical benefit.
- Highlighting each displayed line independently would break multi-line comments, strings, and embedded-language regions.
- Requesting highlighting from the extension host would expand the webview protocol and add serialization work to every diff request.
- Loading a CDN asset at runtime would violate offline behavior and require a weaker content security policy.
