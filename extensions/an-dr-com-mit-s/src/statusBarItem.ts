import type { GitChangeCounts } from "@an-dr/commits-core/data-source/models";
import * as vscode from "vscode";

import { Config } from "./config";
import { EXTENSION_NAME, getCommandId } from "./extension/constant/const";
import { logger } from "./extension/utils/logger";

export class StatusBarItem {
  private statusBarItem: vscode.StatusBarItem;
  private numRepos: number = 0;
  private branchName: string | null = null;
  private changes: GitChangeCounts = { modified: 0, deleted: 0 };
  private config: Config;

  constructor(context: vscode.ExtensionContext, config: Config) {
    this.config = config;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this.statusBarItem.name = EXTENSION_NAME;
    this.statusBarItem.command = getCommandId("view");
    context.subscriptions.push(this.statusBarItem);
    logger.log(
      `StatusBarItem created (showStatusBarItem=${config.showStatusBarItem()}, numRepos=0)`
    );
  }

  public setNumRepos(numRepos: number) {
    logger.log(`StatusBarItem.setNumRepos(${numRepos})`);
    this.numRepos = numRepos;
    this.refresh();
  }

  /** Updates the active branch and working-tree counts shown by the item. */
  public setRepoStatus(branchName: string | null, changes: GitChangeCounts) {
    this.branchName = branchName;
    this.changes = changes;
    this.refresh();
  }

  public refresh() {
    const show = this.config.showStatusBarItem();
    if (show) {
      logger.log(`StatusBarItem.show() (showStatusBarItem=${show}, numRepos=${this.numRepos})`);
      if (this.numRepos === 0) {
        this.statusBarItem.text = this.config.statusBarIconOnly()
          ? "$(eye)"
          : `$(eye) ${EXTENSION_NAME}`;
        this.statusBarItem.tooltip = vscode.l10n.t("No Git repository found — watching for one");
      } else {
        const dirty = this.formatDirty();
        const label = this.branchName ?? EXTENSION_NAME;
        this.statusBarItem.text = this.config.statusBarIconOnly()
          ? `$(git-branch)${dirty}`
          : `$(git-branch) ${label}${dirty}`;
        this.statusBarItem.tooltip =
          this.branchName === null
            ? vscode.l10n.t("View Git Graph")
            : `${vscode.l10n.t("View Git Graph")}: ${this.branchName}`;
      }
      this.statusBarItem.show();
    } else {
      logger.log(`StatusBarItem.hide() (showStatusBarItem=${show}, numRepos=${this.numRepos})`);
      this.statusBarItem.hide();
    }
  }

  /**
   * Renders the working-tree indicator in the configured style: counted
   * (`+2 -1`), a single asterisk for any change at all, or nothing.
   */
  private formatDirty() {
    const style = this.config.statusBarDirtyIndicator();
    if (style === "none") {
      return "";
    }

    const isDirty = this.changes.modified > 0 || this.changes.deleted > 0;
    if (style === "*") {
      return isDirty ? " *" : "";
    }

    const parts: string[] = [];
    if (this.changes.modified > 0) {
      parts.push(`+${this.changes.modified}`);
    }
    if (this.changes.deleted > 0) {
      parts.push(`-${this.changes.deleted}`);
    }
    return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
  }
}
