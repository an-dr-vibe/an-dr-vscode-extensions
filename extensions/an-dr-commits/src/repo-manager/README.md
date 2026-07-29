# `src/repo-manager/`

Support modules for `../repoManager.ts`, which discovers and tracks `.git` repos in
the workspace.

| File | Purpose |
|---|---|
| `workspaceUtils.ts` | Workspace-folder inspection and path-inclusion checks used when deciding which discovered repos to include |
| `externalRepoConfig.ts` | Read/write/validate/generate/apply/export for the external (file-based) repo config format — the `ExternalRepoConfig` namespace and its `GitRepoState` conversions |
