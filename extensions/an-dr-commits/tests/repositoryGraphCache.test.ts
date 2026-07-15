import { GraphProjectionKeyInput, RepositoryGraphCache, createGraphProjectionKey } from '../src/repositoryGraphCache';

interface TestCommit { readonly hash: string; readonly message: string; }
interface TestProjection { readonly hashes: ReadonlyArray<string>; }

function createKeyInput(branches: ReadonlyArray<string> | null = ['main']): GraphProjectionKeyInput {
	return {
		branches,
		maxCommits: 300,
		showTags: true,
		showRemoteBranches: true,
		includeCommitsMentionedByReflogs: false,
		onlyFollowFirstParent: false,
		commitOrdering: 'date',
		remotes: ['origin'],
		hideRemotes: [],
		stashHashes: []
	};
}

describe('RepositoryGraphCache', () => {
	it('Should create stable keys from every graph-affecting request field', () => {
		const input = createKeyInput();
		expect(createGraphProjectionKey(input)).toBe(createGraphProjectionKey({ ...input }));
		expect(createGraphProjectionKey(input)).not.toBe(createGraphProjectionKey({ ...input, branches: ['develop'] }));
		expect(createGraphProjectionKey(input)).not.toBe(createGraphProjectionKey({ ...input, maxCommits: 400 }));
		expect(createGraphProjectionKey(input)).not.toBe(createGraphProjectionKey({ ...input, stashHashes: ['abc'] }));
	});

	it('Should retain projections and mark them stale after a generation change', () => {
		const cache = new RepositoryGraphCache<TestCommit, TestProjection>();
		const commit = { hash: 'abc', message: 'A' };
		const projection = { hashes: ['abc'] };
		cache.setProjection('/repo', 'main', [commit], projection);

		expect(cache.getProjection('/repo', 'main')).toStrictEqual({ projection, stale: false });
		cache.advanceGeneration('/repo');
		expect(cache.getProjection('/repo', 'main')).toStrictEqual({ projection, stale: true });
		expect(cache.getCommit('/repo', 'abc')).toBe(commit);
	});

	it('Should evict the least recently used projection', () => {
		const cache = new RepositoryGraphCache<TestCommit, TestProjection>(10, 2);
		cache.setProjection('/repo', 'one', [], { hashes: ['1'] });
		cache.setProjection('/repo', 'two', [], { hashes: ['2'] });
		cache.getProjection('/repo', 'one');
		cache.setProjection('/repo', 'three', [], { hashes: ['3'] });

		expect(cache.getProjection('/repo', 'one')).not.toBeNull();
		expect(cache.getProjection('/repo', 'two')).toBeNull();
		expect(cache.getProjection('/repo', 'three')).not.toBeNull();
	});

	it('Should bound immutable commits independently from projections', () => {
		const cache = new RepositoryGraphCache<TestCommit, TestProjection>(2, 10);
		const a = { hash: 'a', message: 'A' }, b = { hash: 'b', message: 'B' }, c = { hash: 'c', message: 'C' };
		cache.setProjection('/repo', 'one', [a, b], { hashes: ['a', 'b'] });
		cache.getCommit('/repo', 'a');
		cache.setProjection('/repo', 'two', [c], { hashes: ['c'] });

		expect(cache.getCommit('/repo', 'a')).toBe(a);
		expect(cache.getCommit('/repo', 'b')).toBeNull();
		expect(cache.getCommit('/repo', 'c')).toBe(c);
	});

	it('Should delete all repository state', () => {
		const cache = new RepositoryGraphCache<TestCommit, TestProjection>();
		cache.setProjection('/repo', 'main', [{ hash: 'a', message: 'A' }], { hashes: ['a'] });
		cache.deleteRepository('/repo');

		expect(cache.getProjection('/repo', 'main')).toBeNull();
		expect(cache.getCommit('/repo', 'a')).toBeNull();
	});
});
