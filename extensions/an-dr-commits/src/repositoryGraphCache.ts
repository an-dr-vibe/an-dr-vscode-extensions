/** A commit record retained by the repository graph cache. */
export interface CacheableGraphCommit {
	readonly hash: string;
}

/** The request fields that determine an exact Git-ordered graph projection. */
export interface GraphProjectionKeyInput {
	readonly branches: ReadonlyArray<string> | null;
	readonly maxCommits: number;
	readonly showTags: boolean;
	readonly showRemoteBranches: boolean;
	readonly includeCommitsMentionedByReflogs: boolean;
	readonly onlyFollowFirstParent: boolean;
	readonly commitOrdering: string;
	readonly remotes: ReadonlyArray<string>;
	readonly hideRemotes: ReadonlyArray<string>;
	readonly stashKeys: ReadonlyArray<string>;
}

/** A cached projection and whether it belongs to an older repository generation. */
export interface CachedGraphProjection<TProjection> {
	readonly projection: TProjection;
	readonly stale: boolean;
}

interface ProjectionEntry<TProjection> {
	readonly generation: number;
	readonly projection: TProjection;
}

interface RepositoryCache<TCommit, TProjection> {
	generation: number;
	readonly commits: Map<string, TCommit>;
	readonly projections: Map<string, ProjectionEntry<TProjection>>;
}

/** Creates a stable key for an exact graph projection request. */
export function createGraphProjectionKey(input: GraphProjectionKeyInput): string {
	return JSON.stringify([
		input.branches,
		input.maxCommits,
		input.showTags,
		input.showRemoteBranches,
		input.includeCommitsMentionedByReflogs,
		input.onlyFollowFirstParent,
		input.commitOrdering,
		input.remotes,
		input.hideRemotes,
		input.stashKeys
	]);
}

/** Retains immutable commits and a bounded LRU of exact graph projections per repository. */
export class RepositoryGraphCache<TCommit extends CacheableGraphCommit, TProjection> {
	private readonly repositories = new Map<string, RepositoryCache<TCommit, TProjection>>();

	constructor(
		private readonly maxCommitsPerRepository: number = 20000,
		private readonly maxProjectionsPerRepository: number = 24
	) { }

	/** Returns a cached projection, including stale projections suitable for immediate display. */
	public getProjection(repo: string, key: string): CachedGraphProjection<TProjection> | null {
		const cache = this.repositories.get(repo);
		const entry = cache?.projections.get(key);
		if (!cache || !entry) return null;
		cache.projections.delete(key);
		cache.projections.set(key, entry);
		return { projection: entry.projection, stale: entry.generation !== cache.generation };
	}

	/** Stores an exact projection and the immutable commits learned while producing it. */
	public setProjection(repo: string, key: string, commits: ReadonlyArray<TCommit>, projection: TProjection): void {
		const cache = this.getOrCreateRepository(repo);
		for (const commit of commits) {
			cache.commits.delete(commit.hash);
			cache.commits.set(commit.hash, commit);
		}
		this.trimMap(cache.commits, this.maxCommitsPerRepository);
		cache.projections.delete(key);
		cache.projections.set(key, { generation: cache.generation, projection });
		this.trimMap(cache.projections, this.maxProjectionsPerRepository);
	}

	/** Stores a projection only if its source generation is still current. */
	public setProjectionForGeneration(repo: string, key: string, generation: number, commits: ReadonlyArray<TCommit>, projection: TProjection): boolean {
		if (this.getGeneration(repo) !== generation) return false;
		this.setProjection(repo, key, commits, projection);
		return true;
	}

	/** Returns an immutable commit retained from any projection and refreshes its LRU position. */
	public getCommit(repo: string, hash: string): TCommit | null {
		const commits = this.repositories.get(repo)?.commits;
		const commit = commits?.get(hash);
		if (!commits || !commit) return null;
		commits.delete(hash);
		commits.set(hash, commit);
		return commit;
	}

	/** Marks existing projections stale while retaining immutable commit records. */
	public advanceGeneration(repo: string): void {
		this.getOrCreateRepository(repo).generation++;
	}

	/** Returns the current repository generation. */
	public getGeneration(repo: string): number {
		return this.getOrCreateRepository(repo).generation;
	}

	/** Removes all cached state for a repository. */
	public deleteRepository(repo: string): void {
		this.repositories.delete(repo);
	}

	private getOrCreateRepository(repo: string): RepositoryCache<TCommit, TProjection> {
		let cache = this.repositories.get(repo);
		if (!cache) {
			cache = { generation: 0, commits: new Map(), projections: new Map() };
			this.repositories.set(repo, cache);
		}
		return cache;
	}

	private trimMap<TKey, TValue>(map: Map<TKey, TValue>, limit: number): void {
		while (map.size > Math.max(1, limit)) {
			map.delete(map.keys().next().value);
		}
	}
}
