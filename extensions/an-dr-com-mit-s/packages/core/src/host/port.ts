/**
 * Everything the core needs from whatever application is hosting it.
 *
 * The core never imports `vscode`; it asks the host through this port instead.
 * The VS Code extension is one implementation, a standalone Git client is
 * another, and the in-memory test host is a third.
 */

/** Something to stop listening with. Structurally compatible with vscode's. */
export interface Disposable {
  dispose(): void;
}

/** Reports which settings a configuration change touched. */
export interface ConfigChangeEvent {
  /**
   * @param namespace The setting namespace, e.g. the extension id or "git".
   * @param key Dotted key within the namespace; omitted asks about the whole namespace.
   */
  affects(namespace: string, key?: string): boolean;
}

export interface ConfigPort {
  /** The effective value, falling back when the setting is unset. */
  get<T>(namespace: string, key: string, fallback: T): T;
  /**
   * The value only if something set it explicitly, ignoring defaults. Used to
   * tell "the user chose this" from "this is what ships", which is how the
   * compatibility reader decides whether to fall back to the legacy namespace.
   */
  getExplicit<T>(namespace: string, key: string): T | undefined;
  onDidChange(listener: (event: ConfigChangeEvent) => void): Disposable;
}

/**
 * A key/value store. Shaped to match vscode's Memento so the extension can pass
 * one straight through, and simple enough for any host to implement over a JSON
 * file or a database.
 */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface StoragePort {
  /** Survives across workspaces — avatars, external repositories. */
  readonly global: KeyValueStore;
  /** Scoped to the open workspace — per-repository view state. */
  readonly workspace: KeyValueStore;
  /** Directory the host gives the core for its own files, if it has one. */
  readonly globalStoragePath: string;
}

/** The whole host surface. Grows as each concern moves onto it. */
export interface HostPort {
  readonly config: ConfigPort;
  readonly storage: StoragePort;
}
