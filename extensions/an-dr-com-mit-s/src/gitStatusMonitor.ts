import * as path from "node:path";

import type { GitChangeCounts } from "@an-dr/commits-core/data-source/models";
import * as vscode from "vscode";

import { DataSource } from "@/dataSource";
import { RepoManager } from "@/extension/repoManager";
import { ExtensionState } from "@/extensionState";
import { RepoFileWatcher } from "@/repoFileWatcher";
import { StatusBarItem } from "@/statusBarItem";
import { getSortedRepositoryPaths } from "@/utils";

const EMPTY_COUNTS: GitChangeCounts = { modified: 0, deleted: 0 };

type StatusWatcher = Pick<RepoFileWatcher, "start" | "stop">;

/** Last known status of the repository represented by the status bar. */
interface RepoStatus {
  readonly repo: string | null;
  readonly branchName: string | null;
  readonly counts: GitChangeCounts;
}

/** Tracks the selected repository and refreshes its branch and dirty counts. */
export class GitStatusMonitor {
  private readonly watcher: StatusWatcher;
  private readonly reposSubscription: { dispose(): void };
  private readonly editorSubscription: { dispose(): void };
  private selectedRepo: string | null;
  private activeRepo: string | null = null;
  private branchName: string | null = null;
  private counts: GitChangeCounts = EMPTY_COUNTS;
  private refreshSequence = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly extensionState: ExtensionState,
    private readonly repoManager: RepoManager,
    private readonly statusBarItem: StatusBarItem,
    createWatcher: (onChange: () => void) => StatusWatcher = (onChange) =>
      new RepoFileWatcher(onChange),
    private readonly getActiveFile: () => string | null = () =>
      vscode.window.activeTextEditor?.document.uri.fsPath ?? null,
    onDidChangeActiveFile: (listener: () => void) => { dispose(): void } = (listener) =>
      vscode.window.onDidChangeActiveTextEditor?.(listener) ?? { dispose: () => {} }
  ) {
    this.selectedRepo = extensionState.getLastActiveRepo();
    this.watcher = createWatcher(() => void this.refresh());
    this.reposSubscription = repoManager.onDidChangeRepos(() => this.syncActiveRepo());
    this.editorSubscription = onDidChangeActiveFile(() => this.syncActiveRepo());
    this.syncActiveRepo();
  }

  /** Returns the last status emitted to the status bar. */
  public getStatus(): RepoStatus {
    return { repo: this.activeRepo, branchName: this.branchName, counts: this.counts };
  }

  /** Makes a known repository the status target and persists the selection. */
  public selectRepo(repo: string) {
    if (!(repo in this.repoManager.getRepos())) {
      return;
    }
    this.selectedRepo = repo;
    this.extensionState.setLastActiveRepo(repo);
    this.syncActiveRepo();
  }

  /**
   * Re-reads the active repository's branch and dirty counts. Used after an
   * operation that changed the repository from outside the file watcher's
   * view, such as a completed fetch, pull, or push.
   */
  public refreshStatus() {
    void this.refresh();
  }

  /** Stops repository observation and ignores pending refreshes. */
  public dispose() {
    this.refreshSequence++;
    this.activeRepo = null;
    this.watcher.stop();
    this.reposSubscription.dispose();
    this.editorSubscription.dispose();
  }

  private syncActiveRepo() {
    const repos = this.repoManager.getRepos();
    if (this.selectedRepo !== null && !(this.selectedRepo in repos)) {
      this.selectedRepo = null;
      this.extensionState.setLastActiveRepo(null);
    }
    const next =
      this.selectedRepo !== null && this.selectedRepo in repos
        ? this.selectedRepo
        : (this.getRepoForActiveFile(repos) ?? getSortedRepositoryPaths(repos)[0] ?? null);
    if (next === this.activeRepo) {
      return;
    }

    this.activeRepo = next;
    this.branchName = null;
    this.counts = EMPTY_COUNTS;
    this.refreshSequence++;
    this.statusBarItem.setRepoStatus(null, EMPTY_COUNTS);
    if (next === null) {
      this.watcher.stop();
      return;
    }
    this.watcher.start(next);
    void this.refresh();
  }

  private getRepoForActiveFile(repos: ReturnType<RepoManager["getRepos"]>) {
    const file = this.getActiveFile();
    if (file === null) {
      return null;
    }
    return (
      getSortedRepositoryPaths(repos)
        .filter((repo) => {
          const relative = path.relative(repo, file);
          return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
        })
        .toSorted((a, b) => b.length - a.length)[0] ?? null
    );
  }

  private async refresh() {
    const repo = this.activeRepo;
    if (repo === null) {
      return;
    }
    const sequence = ++this.refreshSequence;
    const [head, counts] = await Promise.all([
      this.dataSource.getHeadInfo(repo),
      this.dataSource.getStatusCounts(repo)
    ]);
    if (sequence !== this.refreshSequence) {
      return;
    }

    this.branchName = head?.branchName || null;
    this.counts = counts ?? EMPTY_COUNTS;
    this.statusBarItem.setRepoStatus(this.branchName, this.counts);
  }
}
