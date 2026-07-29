/** Shared repository status consumed by views without separate Git reads. */
export interface RepositoryStatus {
  readonly repository: string | null;
  readonly isDirty: boolean;
  readonly updatedAt: number;
}

type StatusListener = (status: RepositoryStatus) => void;

/** Holds the latest selection and working-tree state for extension-host views. */
export function createRepositoryStatus() {
  let value: RepositoryStatus = { repository: null, isDirty: false, updatedAt: 0 };
  const listeners = new Set<StatusListener>();

  function get() {
    return value;
  }

  function update(repository: string | null, isDirty: boolean) {
    value = { repository, isDirty, updatedAt: Date.now() };
    for (const listener of listeners) {
      listener(value);
    }
  }

  function subscribe(listener: StatusListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clear() {
    update(null, false);
  }

  return { get, update, subscribe, clear };
}

export type RepositoryStatusStore = ReturnType<typeof createRepositoryStatus>;
