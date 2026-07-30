import * as fs from "node:fs";

import { ExtensionContext, Memento } from "vscode";

import { getPathFromStr } from "./backend/utils/path";
import { getVersionedStateKey, shouldReadStagingLegacyState } from "./extension/constant/const";
import { Avatar, AvatarCache, GitRepoSet } from "./types";

const AVATAR_STORAGE_FOLDER = "/avatars";
const AVATAR_CACHE = "avatarCache";
const LEGACY_LAST_ACTIVE_REPO = "lastActiveRepo";
const LEGACY_REPO_STATES = "repoStates";
const EXTERNAL_REPOS = getVersionedStateKey("externalRepos");
const LAST_ACTIVE_REPO = getVersionedStateKey(LEGACY_LAST_ACTIVE_REPO);
const REPO_STATES = getVersionedStateKey(LEGACY_REPO_STATES);

export class ExtensionState {
  private globalState: Memento;
  private workspaceState: Memento;
  private globalStoragePath: string;
  private avatarStorageAvailable: boolean = false;

  constructor(context: ExtensionContext) {
    this.globalState = context.globalState;
    this.workspaceState = context.workspaceState;

    this.globalStoragePath = getPathFromStr(context.globalStoragePath);
    fs.stat(this.globalStoragePath + AVATAR_STORAGE_FOLDER, (err) => {
      if (!err) {
        this.avatarStorageAvailable = true;
      } else {
        fs.mkdir(this.globalStoragePath, () => {
          fs.mkdir(this.globalStoragePath + AVATAR_STORAGE_FOLDER, (mkdirErr) => {
            if (!mkdirErr) {
              this.avatarStorageAvailable = true;
            }
          });
        });
      }
    });
  }

  /* Discovered Repos */
  public getRepos() {
    return this.getWorkspaceState<GitRepoSet>(REPO_STATES, LEGACY_REPO_STATES, {});
  }
  public saveRepos(gitRepoSet: GitRepoSet) {
    this.workspaceState.update(REPO_STATES, gitRepoSet);
  }
  public getExternalRepos() {
    return this.workspaceState.get<string[]>(EXTERNAL_REPOS, []);
  }
  public saveExternalRepos(repos: string[]) {
    this.workspaceState.update(EXTERNAL_REPOS, repos);
  }

  /* Last Active Repo */
  public getLastActiveRepo() {
    return this.getWorkspaceState<string | null>(LAST_ACTIVE_REPO, LEGACY_LAST_ACTIVE_REPO, null);
  }
  public setLastActiveRepo(repo: string | null) {
    this.workspaceState.update(LAST_ACTIVE_REPO, repo);
  }

  /* Avatars */
  public isAvatarStorageAvailable() {
    return this.avatarStorageAvailable;
  }
  public getAvatarStoragePath() {
    return this.globalStoragePath + AVATAR_STORAGE_FOLDER;
  }
  public getAvatarCache() {
    return this.globalState.get<AvatarCache>(AVATAR_CACHE, {});
  }
  public saveAvatar(email: string, avatar: Avatar) {
    let avatars = this.getAvatarCache();
    avatars[email] = avatar;
    this.globalState.update(AVATAR_CACHE, avatars);
  }
  public removeAvatarFromCache(email: string) {
    let avatars = this.getAvatarCache();
    delete avatars[email];
    this.globalState.update(AVATAR_CACHE, avatars);
  }
  public clearAvatarCache() {
    this.globalState.update(AVATAR_CACHE, {});
    fs.readdir(this.globalStoragePath + AVATAR_STORAGE_FOLDER, (err, files) => {
      if (err) {
        return;
      }
      for (let i = 0; i < files.length; i++) {
        fs.unlink(this.globalStoragePath + AVATAR_STORAGE_FOLDER + "/" + files[i], () => {});
      }
    });
  }

  private getWorkspaceState<T>(key: string, stagingLegacyKey: string, defaultValue: T): T {
    const value = this.workspaceState.get<T>(key);
    if (value !== undefined) {
      return value;
    }
    return shouldReadStagingLegacyState()
      ? this.workspaceState.get<T>(stagingLegacyKey, defaultValue)
      : defaultValue;
  }
}
