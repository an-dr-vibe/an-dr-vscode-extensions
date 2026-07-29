# Settings

The full 139-key triage, with reasoning per key, lives in
[settings-triage.md](settings-triage.md). This file carries only the 34 kept
keys forward, grouped by the backlog item that implements them, checked
against what `src/config.ts` in staging reads today.

| Setting                                                        | Status                                                                                 | Target                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| `statusBarIconOnly`                                            | **Already MIT** — staging reads this exact key today                                   | —                                           |
| `repository.commits.fetchAvatars`                              | Adapter — staging reads the same capability under the flat key `fetchAvatars`          | Backlog 3, key-path adapter                 |
| `keyboardShortcut.refresh`                                     | New implementation — manifest `keybindings` contribution, no runtime logic             | Backlog 3                                   |
| `logLevel`                                                     | New implementation — staging's `logger.ts` has no level filter yet                     | Backlog 3                                   |
| `defaultCommitMessage`                                         | New implementation                                                                     | Backlog 6 — working-tree operations         |
| `dialog.repoInProgress.confirmAbort`                           | New implementation                                                                     | Backlog 6 — repository-in-progress handling |
| `blame.currentUserAlias`                                       | New implementation                                                                     | Backlog 5 group D — inline blame            |
| `blame.delayBlame`                                             | New implementation                                                                     | Backlog 5 group D                           |
| `blame.detectMoveOrCopyFromOtherFiles`                         | New implementation                                                                     | Backlog 5 group D                           |
| `blame.extendedHoverInformation`                               | New implementation                                                                     | Backlog 5 group D                           |
| `blame.ignoreWhitespace`                                       | New implementation                                                                     | Backlog 5 group D                           |
| `blame.inlineMessageEnabled`                                   | New implementation                                                                     | Backlog 5 group D                           |
| `blame.inlineMessageFormat`                                    | New implementation                                                                     | Backlog 5 group D                           |
| `blame.inlineMessageMargin`                                    | New implementation                                                                     | Backlog 5 group D                           |
| `blame.inlineMessageNoCommit`                                  | New implementation                                                                     | Backlog 5 group D                           |
| `blame.maxLineCount`                                           | New implementation                                                                     | Backlog 5 group D                           |
| `inlineBlame.enabled`                                          | New implementation — documented as a deprecated alias for `blame.inlineMessageEnabled` | Backlog 5 group D                           |
| `branchPanel.flattenSingleChildGroups`                         | New implementation                                                                     | Backlog 5 group A — sidebar                 |
| `branchPanel.groupsFirst`                                      | New implementation                                                                     | Backlog 5 group A                           |
| `branchPanel.showLocalBranchUpstream`                          | New implementation                                                                     | Backlog 5 group A                           |
| `graph.showTagsInActivityBar`                                  | New implementation                                                                     | Backlog 5 group A                           |
| `scmButtons.fetch`                                             | New implementation                                                                     | Backlog 5 group A / SCM integration         |
| `scmButtons.pull`                                              | New implementation                                                                     | Backlog 5 group A                           |
| `scmButtons.push`                                              | New implementation                                                                     | Backlog 5 group A                           |
| `statusBarItem.dirtyIndicator`                                 | New implementation                                                                     | Backlog 4 — repository status               |
| `commitDetailsView.defaultDiffMode`                            | New implementation                                                                     | Backlog 8 — details/comparison              |
| `repository.commits.avatar.mode`                               | New implementation                                                                     | Backlog 7 — graph/browser, avatar display   |
| `repository.commits.avatar.shape`                              | New implementation                                                                     | Backlog 7                                   |
| `repository.commits.avatar.size`                               | New implementation                                                                     | Backlog 7                                   |
| `repository.commits.columnVisibility`                          | New implementation                                                                     | Backlog 7                                   |
| `repository.commits.committedVisual`                           | New implementation                                                                     | Backlog 7                                   |
| `repository.onLoad.mode`                                       | New implementation                                                                     | Backlog 4 — repository lifecycle            |
| `repository.onLoad.showRemoteBranchesForSelectedLocalBranches` | New implementation                                                                     | Backlog 4                                   |

32 of 34 are new implementation, matching the settings-gap figure in the
roadmap once the 105 dropped settings are excluded. Re-check this table
against `settings-triage.md` and `src/config.ts` whenever either changes —
this is a snapshot, not a live view.
