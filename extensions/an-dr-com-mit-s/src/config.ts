import * as vscode from "vscode";

import { DateType } from "./backend/types";
import { EXTENSION_ID, getConfigKey, TARGET_EXTENSION_ID } from "./extension/constant/const";
import { DateFormat, GraphStyle } from "./types";

type TabIconColourTheme = "colour" | "grey";
type CommittedVisual = "Avatar" | "Initials";
type AvatarMode =
  | "Auto (Fetched then Pattern)"
  | "Fetched Only"
  | "Procedural Pattern"
  | "Disabled";
type AvatarSize = "Normal" | "Small";
type AvatarShape = "Circle" | "Square";

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration(EXTENSION_ID).get(key, defaultValue);
}

function getExplicitConfig<T>(section: string, key: string): T | undefined {
  const inspected = vscode.workspace.getConfiguration(section).inspect?.<T>(key);
  if (inspected === undefined) {
    return undefined;
  }
  const values = [inspected.workspaceFolderValue, inspected.workspaceValue, inspected.globalValue];
  return values.find((value) => value !== undefined);
}

function getCompatibleConfig<T>(stagingKey: string, targetKey: string, defaultValue: T): T {
  return (
    getExplicitConfig<T>(EXTENSION_ID, stagingKey) ??
    vscode.workspace.getConfiguration(TARGET_EXTENSION_ID).get(targetKey, defaultValue)
  );
}

export const config = {
  autoCenterCommitDetailsView: (): boolean => getConfig("autoCenterCommitDetailsView", true),
  committedVisual: (): CommittedVisual =>
    getCompatibleConfig(
      "repository.commits.committedVisual",
      "repository.commits.committedVisual",
      "Avatar"
    ),
  avatarMode: (): AvatarMode =>
    getCompatibleConfig(
      "repository.commits.avatar.mode",
      "repository.commits.avatar.mode",
      "Auto (Fetched then Pattern)"
    ),
  avatarSize: (): AvatarSize =>
    getCompatibleConfig(
      "repository.commits.avatar.size",
      "repository.commits.avatar.size",
      "Normal"
    ),
  avatarShape: (): AvatarShape =>
    getCompatibleConfig(
      "repository.commits.avatar.shape",
      "repository.commits.avatar.shape",
      "Circle"
    ),
  dateFormat: (): DateFormat => getConfig("dateFormat", "Date & Time"),
  dateType: (): DateType => getConfig("dateType", "Author Date"),
  fetchAvatars: (): boolean =>
    getCompatibleConfig("fetchAvatars", "repository.commits.fetchAvatars", false),
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
  initialLoadCommits: (): number => getConfig("initialLoadCommits", 300),
  loadMoreCommits: (): number => getConfig("loadMoreCommits", 75),
  maxDepthOfRepoSearch: (): number => getConfig("maxDepthOfRepoSearch", 0),
  showCurrentBranchByDefault: (): boolean => getConfig("showCurrentBranchByDefault", false),
  showStatusBarItem: (): boolean => getConfig("showStatusBarItem", true),
  statusBarIconOnly: (): boolean =>
    getCompatibleConfig("statusBarIconOnly", "statusBarIconOnly", true),
  showUncommittedChanges: (): boolean => getConfig("showUncommittedChanges", true),
  tabIconColourTheme: (): TabIconColourTheme => getConfig("tabIconColourTheme", "colour"),
  gitPath: (): string => vscode.workspace.getConfiguration("git").get("path", null) ?? "git",
  affectsStatusBarIconOnly: (event: vscode.ConfigurationChangeEvent): boolean =>
    event.affectsConfiguration(getConfigKey("statusBarIconOnly")) ||
    event.affectsConfiguration(getConfigKey("statusBarIconOnly", TARGET_EXTENSION_ID))
};

export type Config = typeof config;
