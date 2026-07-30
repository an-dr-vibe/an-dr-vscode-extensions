import type { RepoInProgressState } from "@/backend/queries/repoInProgress";
import {
  ActionRequest,
  ActionResponse,
  GitFileChangeType,
  QueryRequest,
  QueryResponse
} from "@/backend/types";

export type GitRepoSet = { [repo: string]: GitRepoState };
export type GitRepoState = {
  columnWidths: number[] | null;
};

export type GitGraphViewState = {
  autoCenterCommitDetailsView: boolean;
  committedVisual: "Avatar" | "Initials";
  avatarMode: "Auto (Fetched then Pattern)" | "Fetched Only" | "Procedural Pattern" | "Disabled";
  avatarSize: "Normal" | "Small";
  avatarShape: "Circle" | "Square";
  dateFormat: DateFormat;
  fetchAvatars: boolean;
  fileIcons: Record<string, string>;
  uiDensity: "Big" | "Normal" | "Compact";
  refreshShortcutKey: string | null;
  columnVisibility: { Committed: boolean; ID: boolean };
  graphColours: string[];
  graphStyle: GraphStyle;
  initialLoadCommits: number;
  lastActiveRepo: string | null;
  loadMoreCommits: number;
  /** VS Code display language (vscode.env.language), used for Intl date formatting */
  locale: string;
  repos: GitRepoSet;
  showCurrentBranchByDefault: boolean;
};

export type Avatar = {
  image: string;
  timestamp: number;
  identicon: boolean;
};
export type AvatarCache = { [email: string]: Avatar };

export type DateFormat = "Date & Time" | "Date Only" | "Relative";
export type GraphStyle = "rounded" | "angular";

/* Infrastructure Request / Response Messages */

export type RequestFetchAvatar = {
  command: "fetchAvatar";
  repo: string;
  email: string;
  commits: string[];
};
export type ResponseFetchAvatar = {
  command: "fetchAvatar";
  email: string;
  image: string;
};

export type RequestSelectRepo = {
  command: "selectRepo";
  repo: string;
};

/** Runs a remote operation the extension host already implements. */
export type RequestRemoteOperation = {
  command: "remoteOperation";
  operation: "fetch" | "pull" | "push";
};

export type RequestLoadRepos = {
  command: "loadRepos";
  check: boolean;
};
export type ResponseLoadRepos = {
  command: "loadRepos";
  repos: GitRepoSet;
  lastActiveRepo: string | null;
};

export type RequestSaveRepoState = {
  command: "saveRepoState";
  repo: string;
  state: GitRepoState;
};

export type RequestCopyToClipboard = {
  command: "copyToClipboard";
  type: string;
  data: string;
};
export type ResponseCopyToClipboard = {
  command: "copyToClipboard";
  type: string;
  success: boolean;
};

export type RequestViewDiff = {
  command: "viewDiff";
  repo: string;
  commitHash: string;
  oldFilePath: string;
  newFilePath: string;
  type: GitFileChangeType;
};
export type ResponseViewDiff = {
  command: "viewDiff";
  success: boolean;
};

export type RequestUtilityAction =
  | {
      command: "archive";
      repo: string;
      ref: string;
    }
  | {
      command: "viewSubmoduleDiff";
      repo: string;
      fromHash: string;
      toHash: string;
      filePath: string;
    }
  | { command: "viewScm" }
  | {
      command: "viewFileAtRevision";
      repo: string;
      hash: string;
      filePath: string;
    }
  | {
      command: "openFile";
      repo: string;
      filePath: string;
      hash: string | null;
    }
  | {
      command: "openExternalUrl";
      url: string;
      type?: string;
    }
  | { command: "openExtensionSettings" }
  | {
      command: "getRelativeTimeDiff";
      unixTimestamp: number;
    };

export type ResponseUtilityAction =
  | {
      command: Exclude<RequestUtilityAction["command"], "getRelativeTimeDiff">;
      error: string | null;
    }
  | {
      command: "getRelativeTimeDiff";
      value: string;
    };

export type ResponseRefresh = {
  command: "refresh";
};

/** Asks for the operation the repository is part-way through. */
export type RequestRepoInProgress = { command: "repoInProgress" };

export type RequestMessage =
  | RequestRepoInProgress
  | ActionRequest
  | QueryRequest
  | RequestFetchAvatar
  | RequestSelectRepo
  | RequestRemoteOperation
  | RequestLoadRepos
  | RequestSaveRepoState
  | RequestCopyToClipboard
  | RequestViewDiff
  | RequestUtilityAction;

/** The operation the repository is part-way through, or null when none is. */
export type ResponseRepoInProgress = {
  command: "repoInProgress";
  state: RepoInProgressState | null;
};

export type ResponseMessage =
  | ResponseRepoInProgress
  | ActionResponse
  | QueryResponse
  | ResponseFetchAvatar
  | ResponseLoadRepos
  | ResponseCopyToClipboard
  | ResponseViewDiff
  | ResponseUtilityAction
  | ResponseRefresh;
