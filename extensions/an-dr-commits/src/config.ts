import * as vscode from "vscode";

import { DateType } from "./backend/types";
import { readCompatibleConfiguration } from "./compat/configuration";
import { EXTENSION_ID } from "./extension/constant/const";
import { DateFormat, GraphStyle } from "./types";

type TabIconColourTheme = "colour" | "grey";

function getConfig<T>(key: string, defaultValue: T, legacyKey = key): T {
  return readCompatibleConfiguration(EXTENSION_ID, key, legacyKey, defaultValue);
}

export const config = {
  autoCenterCommitDetailsView: (): boolean =>
    getConfig("autoCenterCommitDetailsView", true, "commitDetailsView.autoCenter"),
  dateFormat: (): DateFormat => getConfig("dateFormat", "Date & Time", "date.format"),
  dateType: (): DateType => getConfig("dateType", "Author Date"),
  fetchAvatars: (): boolean => getConfig("fetchAvatars", false),
  graphColours: (): string[] =>
    getConfig("graphColours", [
      "#0085d9",
      "#d9008f",
      "#00d90a",
      "#d98500",
      "#a300d9",
      "#ff0000"
    ]).filter(
      (v: string) =>
        v.match(
          /^\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb[a]?\s*\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))\s*$/
        ) !== null
    ),
  graphStyle: (): GraphStyle => getConfig("graphStyle", "rounded"),
  initialLoadCommits: (): number =>
    getConfig("initialLoadCommits", 300, "repository.commits.initialLoad"),
  loadMoreCommits: (): number => getConfig("loadMoreCommits", 75, "repository.commits.loadMore"),
  maxDepthOfRepoSearch: (): number => getConfig("maxDepthOfRepoSearch", 0),
  showCurrentBranchByDefault: (): boolean => getConfig("showCurrentBranchByDefault", false),
  showStatusBarItem: (): boolean => getConfig("showStatusBarItem", true),
  statusBarIconOnly: (): boolean => getConfig("statusBarIconOnly", true),
  showUncommittedChanges: (): boolean =>
    getConfig("showUncommittedChanges", true, "repository.showUncommittedChanges"),
  tabIconColourTheme: (): TabIconColourTheme => getConfig("tabIconColourTheme", "colour"),
  gitPath: (): string => vscode.workspace.getConfiguration("git").get("path", null) ?? "git"
};

export type Config = typeof config;
