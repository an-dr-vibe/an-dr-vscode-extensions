import { DateType } from "@an-dr/commits-core/backend/types";
import type { ConfigChangeEvent, ConfigPort } from "@an-dr/commits-core/host/port";
import { DateFormat, GraphStyle } from "@an-dr/commits-core/types";

import { EXTENSION_ID, TARGET_EXTENSION_ID } from "./extension/constant/const";
import { LogLevel } from "./extension/utils/logger";

type TabIconColourTheme = "colour" | "grey";

/** Where extended blame information appears on hover. */
export type BlameHoverMode = "off" | "inline-status" | "inline" | "status";

/** Density of repeating commit-graph content. */
export type UiDensity = "Big" | "Normal" | "Compact";

/** Which optional commit table columns are shown. */
export type ColumnVisibility = { Committed: boolean; ID: boolean };

/** How the working-tree state is shown in the status bar. */
type DirtyIndicator = "+N -M" | "*" | "none";
type CommittedVisual = "Avatar" | "Initials";
type AvatarMode =
  | "Auto (Fetched then Pattern)"
  | "Fetched Only"
  | "Procedural Pattern"
  | "Disabled";
type AvatarSize = "Normal" | "Small";
type AvatarShape = "Circle" | "Square";

/**
 * The settings the core and the extension read, resolved through whatever the
 * host supplies. `createConfig` is called once with the host's port.
 */
export function createConfig(port: ConfigPort) {
  const getConfig = <T>(key: string, defaultValue: T): T =>
    port.get(EXTENSION_ID, key, defaultValue);

  /**
   * Reads the staging key only if the user set it, otherwise the same setting
   * under the extension identity being replaced, so both coexist during the
   * transition.
   */
  const getCompatibleConfig = <T>(stagingKey: string, targetKey: string, defaultValue: T): T =>
    port.getExplicit<T>(EXTENSION_ID, stagingKey) ??
    port.get(TARGET_EXTENSION_ID, targetKey, defaultValue);

  return {
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
      getConfig("graphColours", ["#6ba2f2", "#ca3a7d", "#f3b33e", "#61aea6", "#ac70f7"]).filter(
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
    // The Git executable is the host's business, not this extension's: VS Code
    // keeps it under its own "git" namespace.
    gitPath: (): string => port.get<string | null>("git", "path", null) ?? "git",
    affectsStatusBarIconOnly: (event: ConfigChangeEvent): boolean =>
      event.affects(EXTENSION_ID, "statusBarIconOnly") ||
      event.affects(TARGET_EXTENSION_ID, "statusBarIconOnly"),

    /**
     * The letter of the refresh shortcut, lower-cased for comparison against a
     * keyboard event, or null when unassigned. The setting stores a label like
     * "CTRL/CMD + R"; only the letter is meaningful to the webview, which
     * already knows the modifier is Ctrl or Cmd.
     */
    refreshShortcutKey: (): string | null => {
      const setting = getConfig("keyboardShortcut.refresh", "CTRL/CMD + R");
      const match = setting.match(/^CTRL\/CMD \+ ([A-Z])$/);
      return match === null ? null : match[1].toLowerCase();
    },

    uiDensity: (): UiDensity => getConfig("uiDensity", "Normal"),
    branchPanelGroupsFirst: (): boolean => getConfig("branchPanel.groupsFirst", true),
    branchPanelFlattenSingleChildGroups: (): boolean =>
      getConfig("branchPanel.flattenSingleChildGroups", true),
    confirmAbortRepoInProgress: (): boolean =>
      getConfig("dialog.repoInProgress.confirmAbort", true),
    columnVisibility: (): ColumnVisibility => {
      const value = getConfig<Partial<ColumnVisibility>>("repository.commits.columnVisibility", {});
      // A partially written object must not hide a column the user never named.
      return { Committed: value.Committed !== false, ID: value.ID !== false };
    },
    affectsTabAppearance: (event: ConfigChangeEvent): boolean =>
      event.affects(EXTENSION_ID, "uiDensity") ||
      event.affects(EXTENSION_ID, "repository.commits.columnVisibility"),

    logLevel: (): LogLevel => getConfig("logLevel", "Info"),
    statusBarDirtyIndicator: (): DirtyIndicator =>
      getConfig("statusBarItem.dirtyIndicator", "+N -M"),
    affectsLogLevel: (event: ConfigChangeEvent): boolean => event.affects(EXTENSION_ID, "logLevel"),

    /* Inline blame */

    /**
     * Inline blame is on when either key is set, so the deprecated alias keeps
     * working for anyone who set it before the rename.
     */
    inlineBlameEnabled: (): boolean =>
      getConfig("blame.inlineMessageEnabled", false) || getConfig("inlineBlame.enabled", false),
    blameInlineMessageFormat: (): string =>
      // The ${...} placeholders are literal: formatBlameText substitutes them.
      // eslint-disable-next-line no-template-curly-in-string
      getConfig("blame.inlineMessageFormat", "Blame ${author.name} (${time.ago})"),
    blameInlineMessageNoCommit: (): string =>
      getConfig("blame.inlineMessageNoCommit", "Not Committed Yet"),
    blameInlineMessageMargin: (): number => getConfig("blame.inlineMessageMargin", 2),
    blameCurrentUserAlias: (): string => getConfig("blame.currentUserAlias", ""),
    blameIgnoreWhitespace: (): boolean => getConfig("blame.ignoreWhitespace", false),
    blameDelay: (): number => getConfig("blame.delayBlame", 0),
    blameMaxLineCount: (): number => getConfig("blame.maxLineCount", 16384),
    blameExtendedHoverInformation: (): BlameHoverMode =>
      getConfig("blame.extendedHoverInformation", "off"),
    blameDetectMoveOrCopyFromOtherFiles: (): number =>
      getConfig("blame.detectMoveOrCopyFromOtherFiles", 0),
    affectsBlame: (event: ConfigChangeEvent): boolean =>
      event.affects(EXTENSION_ID, "blame") || event.affects(EXTENSION_ID, "inlineBlame.enabled")
  };
}

export type Config = ReturnType<typeof createConfig>;
