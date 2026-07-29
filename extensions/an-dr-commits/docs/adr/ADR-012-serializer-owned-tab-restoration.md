# ADR-012: Serializer-owned tab restoration

## Problem

Commits combined VS Code's webview serializer with persisted reopen flags, orphan-detection timers, duplicate-tab timers, and delayed bootstrap retries. These overlapping owners raced during window reload and could close, recreate, or refresh the same tab repeatedly.

## Decision

Make the registered webview serializer the sole owner of restoring open Commits tabs. Pass its serialized webview state into the revived panel's HTML and bootstrap directly from that state; retain only the synchronous duplicate safeguard used when an explicit open command finds an unowned existing tab.

## Rationale

VS Code already serializes editor webviews and supplies their state to the registered serializer. Using that contract directly gives restoration one owner and one payload, while normal panel disposal remains the source of truth for closing a tab.

## Rejected alternatives

- Tune suppression and retry delays; timing remains machine-dependent and ownership remains ambiguous.
- Keep a workspace reopen flag as a fallback; it can recreate a panel while serializer restoration is still in flight.
- Discard serialized state and reload from scratch; this loses the fast-path state that makes restoration responsive.
