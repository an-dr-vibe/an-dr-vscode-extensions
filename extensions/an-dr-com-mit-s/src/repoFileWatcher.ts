import type { Disposable, WatcherPort } from "@an-dr/commits-core/host/port";

const fileChangeRegex =
  /(^\.git\/(config|index|HEAD|refs\/stash|refs\/heads\/.*|refs\/remotes\/.*|refs\/tags\/.*)$)|(^(?!\.git).*$)|(^\.git[^/]+$)/;

export class RepoFileWatcher {
  private repo: string | null = null;
  private readonly repoChangeCallback: () => void;
  private readonly watcher: WatcherPort;
  private subscription: Disposable | null = null;
  private refreshTimeout: NodeJS.Timeout | null = null;
  private muted: boolean = false;
  private resumeAt: number = 0;

  constructor(watcher: WatcherPort, repoChangeCallback: () => void) {
    this.watcher = watcher;
    this.repoChangeCallback = repoChangeCallback;
  }

  public start(repo: string) {
    if (this.subscription !== null) {
      this.stop();
    }

    this.repo = repo;
    this.subscription = this.watcher.watch(repo, (changedPath) => this.refresh(changedPath));
  }

  public stop() {
    if (this.subscription !== null) {
      this.subscription.dispose();
      this.subscription = null;
    }
  }

  public mute() {
    this.muted = true;
  }

  public unmute() {
    this.muted = false;
    this.resumeAt = new Date().getTime() + 1500;
  }

  private async refresh(changedPath: string) {
    if (this.muted) {
      return;
    }
    if (!changedPath.replace(this.repo + "/", "").match(fileChangeRegex)) {
      return;
    }
    if (new Date().getTime() < this.resumeAt) {
      return;
    }

    if (this.refreshTimeout !== null) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.repoChangeCallback();
    }, 750);
  }
}
