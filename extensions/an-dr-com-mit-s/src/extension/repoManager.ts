import { isGitRepository } from "@an-dr/commits-core/backend/utils/git";
import { getPathFromStr } from "@an-dr/commits-core/backend/utils/path";
import { evalPromises } from "@an-dr/commits-core/backend/utils/promise";
import { GitRepoSet, GitRepoState } from "@an-dr/commits-core/types";

import { Config } from "@/config";
import { ExtensionState } from "@/extensionState";
import { StatusBarItem } from "@/statusBarItem";
import { getSortedRepositoryPaths } from "@/utils";

function sortRepos(repos: GitRepoSet) {
  const sorted: GitRepoSet = {};
  for (const repo of getSortedRepositoryPaths(repos)) {
    sorted[repo] = repos[repo];
  }
  return sorted;
}

export function createRepoManager(
  extensionState: ExtensionState,
  statusBarItem: StatusBarItem,
  config: Config
) {
  let repos = extensionState.getRepos();
  const externalRepos = new Set(extensionState.getExternalRepos());
  let viewCallback: ((repos: GitRepoSet, numRepos: number) => void) | null = null;
  const repoListeners = new Set<(repos: GitRepoSet) => void>();

  function setRepos(repoDirs: string[]) {
    const next: GitRepoSet = {};
    for (const repo of [...repoDirs, ...externalRepos]) {
      next[repo] = repos[repo] ?? { columnWidths: null };
    }
    repos = next;
    extensionState.saveRepos(repos);
  }

  function getRepos() {
    return sortRepos(repos);
  }

  /**
   * Finds the known repository containing a file, preferring the deepest match
   * so a file inside a nested repository resolves to that one rather than its
   * parent.
   */
  function getRepoContainingFile(filePath: string) {
    const normalized = getPathFromStr(filePath);
    let match: string | null = null;
    for (const repo of Object.keys(repos)) {
      const root = getPathFromStr(repo);
      if (
        (normalized === root || normalized.startsWith(root + "/")) &&
        (match === null || root.length > match.length)
      ) {
        match = repo;
      }
    }
    return match;
  }

  function sendRepos() {
    const sorted = getRepos();
    const numRepos = Object.keys(sorted).length;
    statusBarItem.setNumRepos(numRepos);
    for (const listener of repoListeners) {
      listener(sorted);
    }
    if (viewCallback !== null) {
      viewCallback(sorted, numRepos);
    }
  }

  /** Subscribes to published repository-list changes. */
  function onDidChangeRepos(listener: (repos: GitRepoSet) => void) {
    repoListeners.add(listener);
    return { dispose: () => repoListeners.delete(listener) };
  }

  function removeRepo(repo: string) {
    delete repos[repo];
    if (externalRepos.delete(repo)) {
      extensionState.saveExternalRepos([...externalRepos]);
    }
    extensionState.saveRepos(repos);
  }

  function registerViewCallback(cb: (repos: GitRepoSet, numRepos: number) => void) {
    viewCallback = cb;
  }

  function deregisterViewCallback() {
    viewCallback = null;
  }

  function isDirectoryWithinRepos(path: string) {
    const repoPaths = Object.keys(repos);
    for (let i = 0; i < repoPaths.length; i++) {
      if (path === repoPaths[i] || path.startsWith(repoPaths[i] + "/")) {
        return true;
      }
    }
    return false;
  }

  function addRepo(repo: string, external = false) {
    if (external && !externalRepos.has(repo)) {
      externalRepos.add(repo);
      extensionState.saveExternalRepos([...externalRepos]);
    }
    if (repos[repo]) {
      return false;
    }
    repos[repo] = { columnWidths: null };
    extensionState.saveRepos(repos);
    return true;
  }

  function removeReposWithinFolder(path: string) {
    const pathFolder = path + "/";
    const repoPaths = Object.keys(repos);
    let changes = false;
    for (let i = 0; i < repoPaths.length; i++) {
      if (repoPaths[i] === path || repoPaths[i].startsWith(pathFolder)) {
        removeRepo(repoPaths[i]);
        changes = true;
      }
    }
    return changes;
  }

  function setRepoState(repo: string, state: GitRepoState) {
    repos[repo] = state;
    extensionState.saveRepos(repos);
  }

  function checkReposExist() {
    return new Promise<boolean>((resolve) => {
      const repoPaths = Object.keys(repos);
      let changes = false;
      evalPromises(repoPaths, 3, (path) => isGitRepository(path, config.gitPath())).then(
        (results) => {
          for (let i = 0; i < repoPaths.length; i++) {
            if (!results[i]) {
              removeRepo(repoPaths[i]);
              changes = true;
            }
          }
          if (changes) {
            sendRepos();
          }
          resolve(changes);
        }
      );
    });
  }

  return {
    registerViewCallback,
    deregisterViewCallback,
    onDidChangeRepos,
    isDirectoryWithinRepos,
    getRepos,
    getRepoContainingFile,
    sendRepos,
    setRepos,
    addRepo,
    removeRepo,
    removeReposWithinFolder,
    setRepoState,
    checkReposExist
  };
}

export type RepoManager = ReturnType<typeof createRepoManager>;
