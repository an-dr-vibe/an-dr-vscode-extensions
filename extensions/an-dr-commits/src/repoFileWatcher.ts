import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from './logger';
import { getPathFromStr, getPathFromUri } from './utils';

const GIT_METADATA_CHANGE_REGEX = /^\.git\/(config|index|HEAD|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|rebase-merge\/.*|rebase-apply\/.*|sequencer\/.*|refs\/stash|refs\/heads\/.*|refs\/remotes\/.*|refs\/tags\/.*)$/;

export type RepoRefreshKind = 'full' | 'workingTree';

/**
 * Watches a Git repository for file events.
 */
export class RepoFileWatcher {
	private readonly logger: Logger;
	private readonly repoChangeCallback: (kind: RepoRefreshKind) => void;
	private repo: string | null = null;
	private fsWatcher: vscode.FileSystemWatcher | null = null;
	private gitDirWatchers: vscode.FileSystemWatcher[] = [];
	private refreshTimeout: NodeJS.Timer | null = null;
	private pendingRefreshKind: RepoRefreshKind | null = null;
	private muteCount: number = 0;
	private resumeAt: number = 0;

	/**
	 * Creates a RepoFileWatcher.
	 * @param logger The Commits Logger instance.
	 * @param repoChangeCallback A callback to be invoked when a file event occurs in the repository.
	 */
	constructor(logger: Logger, repoChangeCallback: (kind: RepoRefreshKind) => void) {
		this.logger = logger;
		this.repoChangeCallback = repoChangeCallback;
	}

	/**
	 * Start watching a repository for file events.
	 * @param repo The path of the repository to watch.
	 */
	public start(repo: string) {
		if (this.fsWatcher !== null) {
			// If there is an existing File System Watcher, stop it
			this.stop();
		}

		this.repo = repo;
		// Create a File System Watcher for all events within the specified repository
		this.fsWatcher = vscode.workspace.createFileSystemWatcher(repo + '/**');
		this.fsWatcher.onDidCreate(uri => this.refreshRepo(uri));
		this.fsWatcher.onDidChange(uri => this.refreshRepo(uri));
		this.fsWatcher.onDidDelete(uri => this.refreshRepo(uri));
		for (const gitDir of this.resolveRedirectedGitDirs(repo)) {
			const watcher = vscode.workspace.createFileSystemWatcher(gitDir + '/**');
			watcher.onDidCreate(uri => this.refreshGitDir(uri, gitDir));
			watcher.onDidChange(uri => this.refreshGitDir(uri, gitDir));
			watcher.onDidDelete(uri => this.refreshGitDir(uri, gitDir));
			this.gitDirWatchers.push(watcher);
		}
		this.logger.logDebug('Started watching repo: ' + repo);
	}

	/**
	 * Stop watching the repository for file events.
	 */
	public stop() {
		if (this.fsWatcher !== null) {
			// If there is an existing File System Watcher, stop it
			this.fsWatcher.dispose();
			this.fsWatcher = null;
			this.logger.logDebug('Stopped watching repo: ' + this.repo);
		}
		if (this.refreshTimeout !== null) {
			// If a timeout is active, clear it
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}
		this.gitDirWatchers.forEach((watcher) => watcher.dispose());
		this.gitDirWatchers = [];
		this.pendingRefreshKind = null;
	}

	/**
	 * Mute file events - Used to prevent many file events from being triggered when a Git action is executed by the Commits View.
	 * Reference-counted: mute/unmute must be balanced; the watcher is only active when the count reaches zero.
	 */
	public mute() {
		this.muteCount++;
	}

	/**
	 * Unmute file events - Used to resume normal watching after a Git action executed by the Commits View has completed.
	 * Reference-counted: the watcher only resumes once all concurrent callers have called unmute().
	 */
	public unmute() {
		if (this.muteCount > 0) this.muteCount--;
		if (this.muteCount === 0) this.resumeAt = (new Date()).getTime() + 1500;
	}


	/**
	 * Handle a file event triggered by the File System Watcher.
	 * @param uri The URI of the file that the event occurred on.
	 */
	private refreshRepo(uri: vscode.Uri) {
		if (this.muteCount > 0) return;
		const relativePath = getPathFromUri(uri).replace(this.repo + '/', '');
		const refreshKind = relativePath === '.git' || GIT_METADATA_CHANGE_REGEX.test(relativePath)
			? 'full'
			: relativePath.startsWith('.git/') ? null : 'workingTree';
		this.queueRefresh(refreshKind);
	}

	/** Handle metadata events from a linked worktree or submodule's redirected Git directory. */
	private refreshGitDir(uri: vscode.Uri, gitDir: string) {
		if (this.muteCount > 0) return;
		const relativePath = getPathFromUri(uri).replace(gitDir + '/', '');
		this.queueRefresh(GIT_METADATA_CHANGE_REGEX.test('.git/' + relativePath) ? 'full' : null);
	}

	private queueRefresh(refreshKind: RepoRefreshKind | null) {
		if (refreshKind === null) return;
		if ((new Date()).getTime() < this.resumeAt) return;

		if (this.pendingRefreshKind !== 'full') this.pendingRefreshKind = refreshKind;
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = setTimeout(() => {
			this.refreshTimeout = null;
			const kind = this.pendingRefreshKind!;
			this.pendingRefreshKind = null;
			this.repoChangeCallback(kind);
		}, 750);
	}

	/** Resolve external per-worktree and shared Git directories referenced by a `.git` file. */
	private resolveRedirectedGitDirs(repo: string): string[] {
		try {
			const dotGit = path.join(repo, '.git');
			if (!fs.statSync(dotGit).isFile()) return [];
			const redirect = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
			if (redirect === null) return [];
			const gitDir = getPathFromStr(path.resolve(repo, redirect[1].trim()));
			const dirs = [gitDir];
			try {
				const commonDir = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
				if (commonDir !== '') dirs.push(getPathFromStr(path.resolve(gitDir, commonDir)));
			} catch (_) { /* Standalone redirected Git directories have no commondir file. */ }
			return Array.from(new Set(dirs));
		} catch (_) {
			return [];
		}
	}
}
