import type * as GG from "@/types";

/** Repository path used by the webview fixtures. */
export const FIXTURE_REPO = "/workspace/my-repo";

/**
 * A complete view state for a single repository.
 *
 * Adding a field to `GitGraphViewState` breaks this one function rather than
 * every webview test, and callers override only what their scenario is about.
 */
export function viewStateFixture(
  overrides: Partial<GG.GitGraphViewState> = {}
): GG.GitGraphViewState {
  return {
    autoCenterCommitDetailsView: true,
    committedVisual: "Initials",
    avatarMode: "Disabled",
    avatarSize: "Normal",
    avatarShape: "Circle",
    dateFormat: "Date & Time",
    fetchAvatars: false,
    fileIcons: {},
    uiDensity: "Normal",
    refreshShortcutKey: "r",
    columnVisibility: { Committed: true, ID: true },
    graphColours: ["#0085d9"],
    graphStyle: "rounded",
    initialLoadCommits: 300,
    lastActiveRepo: null,
    loadMoreCommits: 75,
    locale: "en",
    repos: { [FIXTURE_REPO]: { columnWidths: null } },
    showCurrentBranchByDefault: false,
    ...overrides
  };
}
