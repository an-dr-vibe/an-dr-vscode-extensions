import { simpleGit } from "simple-git";
import * as vscode from "vscode";

import { GitStatusMonitor } from "@/gitStatusMonitor";
import { showErrorMessage } from "@/utils";

/** The remote operations exposed as public commands. */
export type RemoteOperation = "fetch" | "pull" | "push";

/** Supplies the askpass environment for the current session, if any. */
export type AskpassEnvironment = () => Readonly<Record<string, string>>;

/** Runs one remote operation, resolving to an error message or null. */
export type RunRemoteOperation = (
  operation: RemoteOperation,
  repo: string,
  env: Readonly<Record<string, string>>
) => Promise<string | null>;

/**
 * Editor variables are deliberately not inherited. Git needs no editor for a
 * fetch, pull, or push, and simple-git guards environments carrying them.
 * Dropping them is safer than opening that guard.
 */
const EXCLUDED_ENV_KEYS = new Set(["EDITOR", "GIT_EDITOR", "VISUAL"]);

/** The child environment: the host's, minus editors, plus askpass. */
function buildChildEnvironment(env: Readonly<Record<string, string>>) {
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !EXCLUDED_ENV_KEYS.has(key)) {
      childEnv[key] = value;
    }
  }
  return { ...childEnv, ...env };
}

/**
 * Runs a remote operation with the askpass environment applied, so an
 * authenticated remote prompts instead of blocking on a terminal the
 * extension host does not have.
 *
 * simple-git blocks `GIT_ASKPASS` by default, since an attacker-controlled
 * value would let a repository run arbitrary programs. `allowUnsafeAskPass`
 * is its supported escape hatch, and it is enabled only on this dedicated
 * instance — every other Git call in the extension keeps the guard. The value
 * we set is always our own helper inside the extension directory, never
 * anything a repository can influence.
 */
export function runRemoteOperationWithGit(gitPath: () => string): RunRemoteOperation {
  return async (operation, repo, env) => {
    try {
      const git = simpleGit({
        baseDir: repo,
        binary: gitPath(),
        trimmed: false,
        unsafe: { allowUnsafeAskPass: true }
      }).env(buildChildEnvironment(env));
      await git.raw([operation]);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
}

/**
 * Creates the fetch, pull, and push command handlers.
 *
 * Every failure surfaces as a message; none is swallowed. The selected
 * repository's status is refreshed afterwards so the status bar reflects what
 * the operation changed.
 */
export function createRemoteCommands(
  statusMonitor: GitStatusMonitor,
  askpassEnv: AskpassEnvironment,
  run: RunRemoteOperation
) {
  async function execute(operation: RemoteOperation) {
    const repo = statusMonitor.getStatus().repo;
    if (repo === null) {
      await showErrorMessage(
        vscode.l10n.t("Select a Git repository before running {0}.", operation)
      );
      return;
    }

    const error = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.SourceControl, title: operation },
      () => run(operation, repo, askpassEnv())
    );

    if (error !== null) {
      await showErrorMessage(vscode.l10n.t("Git {0} failed: {1}", operation, error));
    }
    statusMonitor.refreshStatus();
  }

  return {
    fetch: () => execute("fetch"),
    pull: () => execute("pull"),
    push: () => execute("push")
  };
}
