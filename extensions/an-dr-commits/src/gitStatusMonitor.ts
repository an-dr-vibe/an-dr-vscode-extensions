import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { DataSource, GitChangeCounts } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoFileWatcher, RepoRefreshKind } from './repoFileWatcher';
import { RepoManager } from './repoManager';
import { getSortedRepositoryPaths } from './utils';
import { Disposable, toDisposable } from './utils/disposable';
import { Event, EventEmitter } from './utils/event';
import { RepoSelectionEvent } from './views/common/repoSelection';

/** The live status of the active repository, as displayed by the status bar and sidebar badge. */
export interface RepoStatus {
	readonly repo: string | null;
	readonly branchName: string | null;
	readonly counts: GitChangeCounts;
}

const EMPTY_COUNTS: GitChangeCounts = { modified: 0, deleted: 0 };

/**
 * The extension's own authority for the active repository and its live status (branch name,
 * working-tree change counts), replacing the state previously read from the vscode.git API
 * (see ADR-022). The active repo follows the shared Commits repo selection, falling back to
 * the repo containing the active editor's file, then the first repo in dropdown order. Changes
 * are detected with a RepoFileWatcher on the active repo; the branch name is read straight
 * from `.git/HEAD` (no git spawn), counts via a debounced `git status`.
 */
export class GitStatusMonitor extends Disposable {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly repoManager: RepoManager;
	private readonly watcher: RepoFileWatcher;
	private readonly statusEmitter = new EventEmitter<RepoStatus>();
	private pinnedRepo: string | null;
	private activeRepo: string | null = null;
	private branchName: string | null = null;
	private counts: GitChangeCounts = EMPTY_COUNTS;
	private refreshSeq = 0;

	constructor(dataSource: DataSource, extensionState: ExtensionState, repoManager: RepoManager, onDidChangeRepoSelection: Event<RepoSelectionEvent>, logger: Logger) {
		super();
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.repoManager = repoManager;
		this.pinnedRepo = extensionState.getLastActiveRepo();
		this.watcher = new RepoFileWatcher(logger, (kind) => void this.refresh(kind));

		this.registerDisposables(
			this.statusEmitter,
			onDidChangeRepoSelection((event) => this.pinRepo(event.repo)),
			repoManager.onDidChangeRepos(() => this.syncActiveRepo()),
			vscode.window.onDidChangeActiveTextEditor(() => this.syncActiveRepo()),
			toDisposable(() => this.watcher.stop())
		);
		this.syncActiveRepo();
	}

	/** An Event emitting the active repository's status after every refresh. */
	get onDidChangeStatus(): Event<RepoStatus> {
		return this.statusEmitter.subscribe;
	}

	/** Gets the last known status of the active repository. */
	public getStatus(): RepoStatus {
		return { repo: this.activeRepo, branchName: this.branchName, counts: this.counts };
	}

	/**
	 * Resolves the currently active repository: the pinned repo if still known, else the known
	 * repo containing the active editor's file, else the first repo in dropdown order (mirrors
	 * the tab's own default-repo fallback in `web/main/loadProcessing.ts`).
	 */
	public getActiveRepoPath(): string | null {
		const repos = this.repoManager.getRepos();
		if (Object.keys(repos).length === 0) return null;
		if (this.pinnedRepo !== null) {
			const known = this.repoManager.findKnownRepoPath(this.pinnedRepo);
			if (known !== null) return known;
			this.pinnedRepo = null;
		}
		const activeUri = vscode.window.activeTextEditor?.document.uri;
		const fileRepo = activeUri ? this.repoManager.getRepoContainingFile(activeUri.fsPath) : null;
		if (fileRepo !== null) return fileRepo;
		return getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder)[0];
	}

	/** Pins the active repository (from a shared repo-selection event) and persists it. */
	private pinRepo(repoPath: string) {
		this.pinnedRepo = this.repoManager.findKnownRepoPath(repoPath) ?? repoPath;
		this.extensionState.setLastActiveRepo(this.pinnedRepo);
		this.syncActiveRepo();
	}

	/** Re-resolves the active repository, re-targeting the watcher and refreshing on change. */
	private syncActiveRepo() {
		const next = this.getActiveRepoPath();
		if (next === this.activeRepo) return;
		this.activeRepo = next;
		this.branchName = null;
		this.counts = EMPTY_COUNTS;
		this.refreshSeq++;
		if (next === null) {
			this.watcher.stop();
			this.emitStatus();
		} else {
			this.watcher.start(next);
			void this.refresh('full');
		}
	}

	/**
	 * Refreshes the status of the active repository. The branch name is emitted as soon as
	 * `.git/HEAD` has been read (instant, no git spawn); counts follow once `git status`
	 * resolves - which on startup also waits for git executable discovery to settle.
	 */
	private async refresh(kind: RepoRefreshKind) {
		const repo = this.activeRepo;
		if (repo === null) return;
		this.dataSource.advanceGraphGeneration(repo);
		const seq = ++this.refreshSeq;
		if (kind === 'full') {
			const branchName = await readHeadBranchName(repo);
			if (seq !== this.refreshSeq) return;
			this.branchName = branchName;
			this.emitStatus();
		}
		const counts = await this.dataSource.getStatusCounts(repo);
		if (seq !== this.refreshSeq) return;
		this.counts = counts ?? EMPTY_COUNTS;
		this.emitStatus();
	}

	private emitStatus() {
		this.statusEmitter.emit(this.getStatus());
	}
}

/**
 * Reads the checked-out branch name directly from the repository's `.git/HEAD` file - no git
 * spawn, so it's available instantly at startup. Follows a `gitdir:` redirect when `.git` is a
 * file (submodules, linked worktrees).
 * @returns The branch name, or NULL when HEAD is detached or unreadable.
 */
async function readHeadBranchName(repo: string): Promise<string | null> {
	try {
		let gitDir = path.join(repo, '.git');
		if ((await statFile(gitDir)).isFile()) {
			const redirect = (await readTextFile(gitDir)).match(/^gitdir:\s*(.+)$/m);
			if (redirect === null) return null;
			gitDir = path.resolve(repo, redirect[1].trim());
		}
		const head = await readTextFile(path.join(gitDir, 'HEAD'));
		const ref = head.match(/^ref: refs\/heads\/(.+)$/m);
		return ref !== null ? ref[1].trim() : null;
	} catch (_) {
		return null;
	}
}

function statFile(filePath: string): Promise<fs.Stats> {
	return new Promise((resolve, reject) => fs.stat(filePath, (err, stats) => err ? reject(err) : resolve(stats)));
}

function readTextFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => fs.readFile(filePath, 'utf8', (err, data) => err ? reject(err) : resolve(data)));
}
