# `src/life-cycle/`

Anonymous install/update/uninstall telemetry: each event carries only the extension
and VS Code version numbers plus a 256-bit random nonce, queued to disk and flushed
to an API endpoint — no personal or correlatable data. See the notice at the top of
`uninstall.ts` for the full disclosure.

| File | Purpose |
|---|---|
| `startup.ts` | `onStartUp()` — called from `extension.ts` on activation; detects install vs. update by comparing the persisted version to the current one, queues the corresponding event |
| `uninstall.ts` | Standalone script (VS Code's `uninstallHooks` mechanism runs this directly, not imported as a module) — queues an uninstall event on the way out |
| `utils.ts` | Shared plumbing for both: `LifeCycleStage` enum, `LifeCycleState`/`LifeCycleEvent` types, nonce generation, reading/writing the persisted queue file, and `sendQueue()` to flush it to the API |
