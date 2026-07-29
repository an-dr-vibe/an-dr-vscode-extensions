# `src/utils/`

Small standalone utility classes with no git/VS Code-specific logic — as opposed to
`../utils.ts`, which holds backend utilities that *are* git/VS Code-specific.

| File | Purpose |
|---|---|
| `disposable.ts` | `Disposable` — base class most backend classes extend for `vscode.Disposable` bookkeeping (`registerDisposable(s)`, `isDisposed()`); `toDisposable()` wraps a plain function as a `vscode.Disposable` |
| `event.ts` | `EventEmitter<T>` / `Event<T>` — a minimal typed pub-sub pair used for cross-class event wiring (e.g. repo-selection sync, config-change notifications) instead of VS Code's own `EventEmitter` |
| `bufferedQueue.ts` | `BufferedQueue<T>` — coalesces rapid-fire triggers (e.g. file-watcher events) into a single debounced callback |
