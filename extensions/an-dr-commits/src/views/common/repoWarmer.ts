import { DataSource } from '../../dataSource';
import { ExtensionState } from '../../extensionState';
import { Logger } from '../../logger';
import { LastRepoRequests } from '../../types';
import { Disposable } from '../../utils/disposable';

/**
 * How long to wait before warming. Long enough that a warm-up triggered by one surface finishing
 * its load never competes with that surface's remaining work, matching the delay `DataSource`'s
 * own branch-filter warm-up already uses.
 */
const WARM_DELAY = 750;

/**
 * Populates the shared caches with the requests a repository was last loaded with, so whichever
 * surface opens next finds its data already there (see ADR-026).
 *
 * Warming is strictly best-effort: it is deferred, deduplicated per repository, and every failure
 * is swallowed. It never blocks, delays, or alters what the surface that triggered it renders.
 */
export class RepoWarmer extends Disposable {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly logger: Logger;
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(dataSource: DataSource, extensionState: ExtensionState, logger: Logger) {
		super();
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.logger = logger;
		this.registerDisposable({
			dispose: () => {
				this.timers.forEach((timer) => clearTimeout(timer));
				this.timers.clear();
			}
		});
	}

	/**
	 * Schedules a warm-up of a repository's recorded requests. Calling this repeatedly for the
	 * same repository (e.g. on every refresh) collapses into a single deferred run.
	 * @param repo The path of the repository to warm.
	 */
	public warm(repo: string) {
		const existing = this.timers.get(repo);
		if (existing) clearTimeout(existing);
		this.timers.set(repo, setTimeout(() => {
			this.timers.delete(repo);
			void this.run(repo).catch(() => { });
		}, WARM_DELAY));
	}

	/**
	 * Replays the recorded repo-info and commits requests. The repo-info load runs first because
	 * the commits request needs the remotes and stashes it resolves - those are deliberately not
	 * persisted (they are volatile), so they are recombined here with the recorded parameters.
	 */
	private async run(repo: string) {
		if (this.isDisposed()) return;
		const recorded: LastRepoRequests | null = this.extensionState.getLastRepoRequests(repo);
		if (recorded === null || recorded.repoInfo === null) return;

		const repoInfo = await this.dataSource.getRepoInfo(repo, recorded.repoInfo.showRemoteBranches, recorded.repoInfo.showStashes, recorded.repoInfo.hideRemotes);
		if (this.isDisposed() || repoInfo.error !== null || recorded.commits === null) return;

		const commits = recorded.commits;
		await this.dataSource.getCommits(
			repo, commits.branches, commits.maxCommits, commits.showTags, commits.showRemoteBranches,
			commits.includeCommitsMentionedByReflogs, commits.onlyFollowFirstParent, commits.commitOrdering,
			repoInfo.remotes, commits.hideRemotes, repoInfo.stashes
		);
		this.logger.logDebug('Warmed cached repository data for ' + repo);
	}
}
