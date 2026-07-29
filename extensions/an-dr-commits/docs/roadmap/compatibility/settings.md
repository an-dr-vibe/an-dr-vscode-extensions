# Settings inventory

Generated from the current Commits manifest by `scripts/build-compatibility-ledger.js`. Values are recorded as public settings facts, not copied implementation. Each row starts as an adapter requirement and is promoted to **Already MIT** only after the compatibility reader has a behaviour test.

| Setting                                                                      | Default                                               | Migration category |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------ |
| `an-dr-commits.uiDensity`                                                    | `"Normal"`                                            | Adapter            |
| `an-dr-commits.commitDetailsView.autoCenter`                                 | `true`                                                | Adapter            |
| `an-dr-commits.commitDetailsView.fileView.fileTree.compactFolders`           | `true`                                                | Adapter            |
| `an-dr-commits.commitDetailsView.fileView.type`                              | `"File Tree"`                                         | Adapter            |
| `an-dr-commits.commitDetailsView.defaultDiffMode`                            | `"Quick"`                                             | Adapter            |
| `an-dr-commits.commitDetailsView.location`                                   | `"Inline"`                                            | Adapter            |
| `an-dr-commits.contextMenuActionsVisibility`                                 | `{}`                                                  | Adapter            |
| `an-dr-commits.customBranchGlobPatterns`                                     | `[]`                                                  | Adapter            |
| `an-dr-commits.customEmojiShortcodeMappings`                                 | `[]`                                                  | Adapter            |
| `an-dr-commits.customPullRequestProviders`                                   | `[]`                                                  | Adapter            |
| `an-dr-commits.date.format`                                                  | `"Date & Time"`                                       | Adapter            |
| `an-dr-commits.dialog.addTag.pushToRemote`                                   | `false`                                               | Adapter            |
| `an-dr-commits.dialog.addTag.type`                                           | `"Annotated"`                                         | Adapter            |
| `an-dr-commits.dialog.applyStash.reinstateIndex`                             | `false`                                               | Adapter            |
| `an-dr-commits.dialog.cherryPick.noCommit`                                   | `false`                                               | Adapter            |
| `an-dr-commits.dialog.cherryPick.recordOrigin`                               | `false`                                               | Adapter            |
| `an-dr-commits.dialog.createBranch.checkOut`                                 | `false`                                               | Adapter            |
| `an-dr-commits.dialog.deleteBranch.forceDelete`                              | `false`                                               | Adapter            |
| `an-dr-commits.dialog.fetchIntoLocalBranch.forceFetch`                       | `false`                                               | Adapter            |
| `an-dr-commits.dialog.fetchRemote.prune`                                     | `false`                                               | Adapter            |
| `an-dr-commits.dialog.fetchRemote.pruneTags`                                 | `false`                                               | Adapter            |
| `an-dr-commits.dialog.general.referenceInputSpaceSubstitution`               | `"None"`                                              | Adapter            |
| `an-dr-commits.dialog.merge.noCommit`                                        | `false`                                               | Adapter            |
| `an-dr-commits.dialog.merge.noFastForward`                                   | `true`                                                | Adapter            |
| `an-dr-commits.dialog.merge.squashCommits`                                   | `false`                                               | Adapter            |
| `an-dr-commits.dialog.merge.squashMessageFormat`                             | `"Default"`                                           | Adapter            |
| `an-dr-commits.dialog.popStash.reinstateIndex`                               | `false`                                               | Adapter            |
| `an-dr-commits.dialog.pullBranch.noFastForward`                              | `false`                                               | Adapter            |
| `an-dr-commits.dialog.pullBranch.squashCommits`                              | `false`                                               | Adapter            |
| `an-dr-commits.dialog.pullBranch.squashMessageFormat`                        | `"Default"`                                           | Adapter            |
| `an-dr-commits.dialog.rebase.ignoreDate`                                     | `true`                                                | Adapter            |
| `an-dr-commits.dialog.rebase.launchInteractiveRebase`                        | `false`                                               | Adapter            |
| `an-dr-commits.dialog.repoInProgress.confirmAbort`                           | `true`                                                | Adapter            |
| `an-dr-commits.dialog.resetCurrentBranchToCommit.mode`                       | `"Mixed"`                                             | Adapter            |
| `an-dr-commits.dialog.resetUncommittedChanges.mode`                          | `"Mixed"`                                             | Adapter            |
| `an-dr-commits.dialog.stashUncommittedChanges.includeUntracked`              | `true`                                                | Adapter            |
| `an-dr-commits.defaultCommitMessage`                                         | `"WIP"`                                               | Adapter            |
| `an-dr-commits.enhancedAccessibility`                                        | `false`                                               | Adapter            |
| `an-dr-commits.fileEncoding`                                                 | `"utf8"`                                              | Adapter            |
| `an-dr-commits.graph.colours`                                                | `["#6ba2f2","#ca3a7d","#f3b33e","#61aea6","#ac70f7"]` | Adapter            |
| `an-dr-commits.graph.style`                                                  | `"rounded"`                                           | Adapter            |
| `an-dr-commits.graph.uncommittedChanges`                                     | `"Open Circle at the Uncommitted Changes"`            | Adapter            |
| `an-dr-commits.graph.showTagsInActivityBar`                                  | `true`                                                | Adapter            |
| `an-dr-commits.integratedTerminalShell`                                      | `""`                                                  | Adapter            |
| `an-dr-commits.keyboardShortcut.find`                                        | `"CTRL/CMD + F"`                                      | Adapter            |
| `an-dr-commits.keyboardShortcut.refresh`                                     | `"CTRL/CMD + R"`                                      | Adapter            |
| `an-dr-commits.keyboardShortcut.scrollToHead`                                | `"CTRL/CMD + H"`                                      | Adapter            |
| `an-dr-commits.keyboardShortcut.scrollToStash`                               | `"CTRL/CMD + S"`                                      | Adapter            |
| `an-dr-commits.markdown`                                                     | `true`                                                | Adapter            |
| `an-dr-commits.maxDepthOfRepoSearch`                                         | `0`                                                   | Adapter            |
| `an-dr-commits.logLevel`                                                     | `"Info"`                                              | Adapter            |
| `an-dr-commits.openNewTabEditorGroup`                                        | `"Active"`                                            | Adapter            |
| `an-dr-commits.openToTheRepoOfTheActiveTextEditorDocument`                   | `false`                                               | Adapter            |
| `an-dr-commits.inlineBlame.enabled`                                          | `false`                                               | Adapter            |
| `an-dr-commits.blame.inlineMessageEnabled`                                   | `false`                                               | Adapter            |
| `an-dr-commits.blame.inlineMessageFormat`                                    | `"Blame ${author.name} (${time.ago})"`                | Adapter            |
| `an-dr-commits.blame.inlineMessageNoCommit`                                  | `"Not Committed Yet"`                                 | Adapter            |
| `an-dr-commits.blame.inlineMessageMargin`                                    | `2`                                                   | Adapter            |
| `an-dr-commits.blame.currentUserAlias`                                       | `""`                                                  | Adapter            |
| `an-dr-commits.blame.ignoreWhitespace`                                       | `false`                                               | Adapter            |
| `an-dr-commits.blame.delayBlame`                                             | `0`                                                   | Adapter            |
| `an-dr-commits.blame.maxLineCount`                                           | `16384`                                               | Adapter            |
| `an-dr-commits.blame.extendedHoverInformation`                               | `"off"`                                               | Adapter            |
| `an-dr-commits.blame.detectMoveOrCopyFromOtherFiles`                         | `0`                                                   | Adapter            |
| `an-dr-commits.referenceLabels.alignment`                                    | `"Normal"`                                            | Adapter            |
| `an-dr-commits.referenceLabels.combineLocalAndRemoteBranchLabels`            | `true`                                                | Adapter            |
| `an-dr-commits.repository.commits.fetchAvatars`                              | `true`                                                | Adapter            |
| `an-dr-commits.repository.commits.columnVisibility`                          | `{"Committed":true,"ID":true}`                        | Adapter            |
| `an-dr-commits.repository.commits.committedVisual`                           | `"Avatar"`                                            | Adapter            |
| `an-dr-commits.repository.commits.avatar.mode`                               | `"Auto (Fetched then Pattern)"`                       | Adapter            |
| `an-dr-commits.repository.commits.avatar.size`                               | `"Normal"`                                            | Adapter            |
| `an-dr-commits.repository.commits.avatar.shape`                              | `"Circle"`                                            | Adapter            |
| `an-dr-commits.repository.commits.initialLoad`                               | `300`                                                 | Adapter            |
| `an-dr-commits.repository.commits.loadMore`                                  | `100`                                                 | Adapter            |
| `an-dr-commits.repository.commits.loadMoreAutomatically`                     | `true`                                                | Adapter            |
| `an-dr-commits.repository.commits.mute.commitsThatAreNotAncestorsOfHead`     | `false`                                               | Adapter            |
| `an-dr-commits.repository.commits.mute.mergeCommits`                         | `true`                                                | Adapter            |
| `an-dr-commits.repository.commits.order`                                     | `"date"`                                              | Adapter            |
| `an-dr-commits.repository.commits.showSignatureStatus`                       | `false`                                               | Adapter            |
| `an-dr-commits.repository.fetchAndPrune`                                     | `false`                                               | Adapter            |
| `an-dr-commits.repository.fetchAndPruneTags`                                 | `false`                                               | Adapter            |
| `an-dr-commits.repository.includeCommitsMentionedByReflogs`                  | `false`                                               | Adapter            |
| `an-dr-commits.repository.onLoad.scrollToHead`                               | `false`                                               | Adapter            |
| `an-dr-commits.repository.onLoad.mode`                                       | `"showAll"`                                           | Adapter            |
| `an-dr-commits.repository.onLoad.showCheckedOutBranch`                       | `false`                                               | Adapter            |
| `an-dr-commits.repository.onLoad.showSpecificBranches`                       | `[]`                                                  | Adapter            |
| `an-dr-commits.repository.onlyFollowFirstParent`                             | `false`                                               | Adapter            |
| `an-dr-commits.repository.showCommitsOnlyReferencedByTags`                   | `true`                                                | Adapter            |
| `an-dr-commits.repository.showRemoteBranches`                                | `true`                                                | Adapter            |
| `an-dr-commits.repository.onLoad.showRemoteBranchesForSelectedLocalBranches` | `true`                                                | Adapter            |
| `an-dr-commits.repository.showRemoteHeads`                                   | `true`                                                | Adapter            |
| `an-dr-commits.repository.showStashes`                                       | `true`                                                | Adapter            |
| `an-dr-commits.repository.showTags`                                          | `true`                                                | Adapter            |
| `an-dr-commits.repository.showUncommittedChanges`                            | `true`                                                | Adapter            |
| `an-dr-commits.repository.showUntrackedFiles`                                | `true`                                                | Adapter            |
| `an-dr-commits.repository.sign.commits`                                      | `false`                                               | Adapter            |
| `an-dr-commits.repository.sign.tags`                                         | `false`                                               | Adapter            |
| `an-dr-commits.repository.useMailmap`                                        | `false`                                               | Adapter            |
| `an-dr-commits.repositoryDropdownOrder`                                      | `"Workspace Full Path"`                               | Adapter            |
| `an-dr-commits.retainContextWhenHidden`                                      | `true`                                                | Adapter            |
| `an-dr-commits.branchPanel.flattenSingleChildGroups`                         | `true`                                                | Adapter            |
| `an-dr-commits.branchPanel.groupsFirst`                                      | `true`                                                | Adapter            |
| `an-dr-commits.branchPanel.showLocalBranchUpstream`                          | `true`                                                | Adapter            |
| `an-dr-commits.showStatusBarItem`                                            | `true`                                                | Adapter            |
| `an-dr-commits.statusBarIconOnly`                                            | `true`                                                | Adapter            |
| `an-dr-commits.statusBarItem.dirtyIndicator`                                 | `"+N -M"`                                             | Adapter            |
| `an-dr-commits.sourceCodeProviderIntegrationLocation`                        | `"Inline"`                                            | Adapter            |
| `an-dr-commits.scmButtons.fetch`                                             | `true`                                                | Adapter            |
| `an-dr-commits.scmButtons.pull`                                              | `true`                                                | Adapter            |
| `an-dr-commits.scmButtons.push`                                              | `true`                                                | Adapter            |
| `an-dr-commits.tabIconColourTheme`                                           | `"colour"`                                            | Adapter            |
| `an-dr-commits.autoCenterCommitDetailsView`                                  | `true`                                                | Adapter            |
| `an-dr-commits.combineLocalAndRemoteBranchLabels`                            | `true`                                                | Adapter            |
| `an-dr-commits.commitDetailsViewFileTreeCompactFolders`                      | `true`                                                | Adapter            |
| `an-dr-commits.commitDetailsViewLocation`                                    | `"Inline"`                                            | Adapter            |
| `an-dr-commits.commitOrdering`                                               | `"date"`                                              | Adapter            |
| `an-dr-commits.dateFormat`                                                   | `"Date & Time"`                                       | Adapter            |
| `an-dr-commits.defaultFileViewType`                                          | `"File Tree"`                                         | Adapter            |
| `an-dr-commits.fetchAndPrune`                                                | `false`                                               | Adapter            |
| `an-dr-commits.fetchAvatars`                                                 | `false`                                               | Adapter            |
| `an-dr-commits.graphColours`                                                 | `["#6ba2f2","#ca3a7d","#f3b33e","#61aea6","#ac70f7"]` | Adapter            |
| `an-dr-commits.graphStyle`                                                   | `"rounded"`                                           | Adapter            |
| `an-dr-commits.includeCommitsMentionedByReflogs`                             | `false`                                               | Adapter            |
| `an-dr-commits.initialLoadCommits`                                           | `300`                                                 | Adapter            |
| `an-dr-commits.loadMoreCommits`                                              | `100`                                                 | Adapter            |
| `an-dr-commits.loadMoreCommitsAutomatically`                                 | `true`                                                | Adapter            |
| `an-dr-commits.muteCommitsThatAreNotAncestorsOfHead`                         | `false`                                               | Adapter            |
| `an-dr-commits.muteMergeCommits`                                             | `true`                                                | Adapter            |
| `an-dr-commits.onlyFollowFirstParent`                                        | `false`                                               | Adapter            |
| `an-dr-commits.openDiffTabLocation`                                          | `"Active"`                                            | Adapter            |
| `an-dr-commits.openRepoToHead`                                               | `false`                                               | Adapter            |
| `an-dr-commits.referenceLabelAlignment`                                      | `"Normal"`                                            | Adapter            |
| `an-dr-commits.showCommitsOnlyReferencedByTags`                              | `true`                                                | Adapter            |
| `an-dr-commits.showCurrentBranchByDefault`                                   | `false`                                               | Adapter            |
| `an-dr-commits.showSignatureStatus`                                          | `false`                                               | Adapter            |
| `an-dr-commits.showTags`                                                     | `true`                                                | Adapter            |
| `an-dr-commits.showUncommittedChanges`                                       | `true`                                                | Adapter            |
| `an-dr-commits.showUntrackedFiles`                                           | `true`                                                | Adapter            |
| `an-dr-commits.useMailmap`                                                   | `false`                                               | Adapter            |
