# ADR-008: Recurse into known repos when searching for nested repos

## Problem

`RepoManager.searchDirectoryForRepos` is used both for the initial workspace
scan and for re-scans triggered by `an-dr-commits.maxDepthOfRepoSearch`
changing. Its entry guard was:

```ts
if (this.isDirectoryWithinRepos(directory) && this.isKnownRepo(directory)) {
    resolve(false);
    return;
}
```

Once a workspace root folder is itself a git repo, it becomes a known repo on
first activation. Every subsequent scan of that same root (startup, or a
`maxDepthOfRepoSearch` increase) hit this guard and returned immediately,
*before* ever reading the directory's contents. Non-submodule repos nested
inside an already-known repo (e.g. sibling clones checked out under a parent
repo's working tree and excluded via `.gitignore`) were never discovered,
regardless of how high `maxDepthOfRepoSearch` was set.

The guard wasn't accidental, though: `addRepo()` unconditionally overwrites
`this.repos[repo]` with `DEFAULT_REPO_STATE`, so calling it again on an
already-known repo would silently reset `starred`, `workspaceFolderIndex`,
`lastImportAt`, etc. The guard's real job was to protect against that.

## Decision

Split `searchDirectoryForRepos` so the "read this directory's children and
recurse" logic lives in a new `searchSubdirectoriesForRepos(directory,
maxDepth)` helper, called from both the "new repo found" branch and the
"already known repo" branch. The known-repo branch now skips only the
`addRepo` call (preserving existing state) but still recurses into
subdirectories when `maxDepth > 0`.

## Rationale

- Fixes nested (non-submodule) repo discovery without touching `addRepo`'s
  overwrite semantics, which other call sites (`registerRepo`,
  `searchRepoForSubmodules`, `resolveRepoContainingFile`) already guard
  against on their own.
- Single point of truth for the recursion logic — no duplicated readdir
  blocks.
- Smallest possible blast radius: change is contained to
  `searchDirectoryForRepos`/`searchSubdirectoriesForRepos` in
  `repoManager.ts`.

## Rejected alternatives

- **Inline a third copy of the readdir/recurse block in the guard branch.**
  Same runtime effect, but leaves three near-identical recursion blocks in
  one function instead of one shared helper.
- **Make `addRepo` idempotent (merge instead of overwrite) and delete the
  guard entirely.** Conceptually simpler (one code path), but widens the
  change to a method shared by three other call sites for a bug that, in
  practice, only manifests in `searchDirectoryForRepos`.
