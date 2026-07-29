import type { GitCommitDetails, GitCommitNode } from "./git.types";

type QueryPayloads = {
  commitDetails: {
    request: { repo: string; commitHash: string };
    response: { commitDetails: GitCommitDetails | null };
  };
  loadBranches: {
    request: { showRemoteBranches: boolean; hard: boolean };
    response: { branches: string[]; head: string | null; hard: boolean; isRepo: boolean };
  };
  loadCommits: {
    request: {
      repo: string;
      branchName: string;
      maxCommits: number;
      showRemoteBranches: boolean;
      hard: boolean;
      /** Identifies the webview request so obsolete responses can be ignored. */
      generation: number;
    };
    response: {
      commits: GitCommitNode[];
      head: string | null;
      moreCommitsAvailable: boolean;
      hard: boolean;
      /** Echoes the request generation that produced this response. */
      generation: number;
    };
  };
};

export type QueryRequest = {
  [K in keyof QueryPayloads]: { command: K } & QueryPayloads[K]["request"];
}[keyof QueryPayloads];

export type QueryResponse = {
  [K in keyof QueryPayloads]: { command: K } & QueryPayloads[K]["response"];
}[keyof QueryPayloads];

export type QueryResult<T extends keyof QueryPayloads> = QueryPayloads[T]["response"];
