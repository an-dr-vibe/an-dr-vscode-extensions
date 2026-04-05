/* Bootstrap helpers extracted from CommitsView module-level code */

function commitsRegisterMessageHandler(commits: CommitsView) {
	window.addEventListener('message', event => {
		const msg: GG.ResponseMessage = event.data;
		switch (msg.command) {
			case 'addRemote':
				refreshOrDisplayError(msg.error, 'Unable to Add Remote', true);
				break;
			case 'addTag':
				if (msg.pushToRemote !== null && msg.errors.length === 2 && msg.errors[0] === null && isExtensionErrorInfo(msg.errors[1], GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote)) {
					commits.refresh(false);
					handleResponsePushTagCommitNotOnRemote(msg.repo, msg.tagName, [msg.pushToRemote], msg.commitHash, msg.errors[1]!);
				} else {
					refreshAndDisplayErrors(msg.errors, 'Unable to Add Tag');
				}
				break;
			case 'applyStash':
				refreshOrDisplayError(msg.error, 'Unable to Apply Stash');
				break;
			case 'branchFromStash':
				refreshOrDisplayError(msg.error, 'Unable to Create Branch from Stash');
				break;
			case 'checkoutBranch':
				refreshAndDisplayErrors(msg.errors, 'Unable to Checkout Branch' + (msg.pullAfterwards !== null ? ' & Pull Changes' : ''));
				break;
			case 'checkoutCommit':
				refreshOrDisplayError(msg.error, 'Unable to Checkout Commit');
				break;
			case 'cherrypickCommit':
				refreshAndDisplayErrors(msg.errors, 'Unable to Cherry Pick Commit');
				break;
			case 'cleanUntrackedFiles':
				refreshOrDisplayError(msg.error, 'Unable to Clean Untracked Files');
				break;
			case 'commitDetails':
				if (msg.commitDetails !== null) {
					const fileTree = commits.createFileTree(msg.commitDetails.fileChanges, msg.codeReview);
					commits.showCommitDetails(msg.commitDetails, fileTree, msg.avatar, msg.codeReview, msg.codeReview !== null ? msg.codeReview.lastViewedFile : null, msg.refresh);
					commits.applyPreviewResponse(msg.commitDetails, fileTree, msg.codeReview);
				} else {
					commits.closeCommitDetails(true);
					dialog.showError('Unable to load Commit Details', msg.error, null, null);
				}
				break;
			case 'compareCommits':
				if (msg.error === null) {
					const compFileTree = commits.createFileTree(msg.fileChanges, msg.codeReview);
					commits.showCommitComparison(msg.commitHash, msg.compareWithHash, msg.fileChanges, compFileTree, msg.codeReview, msg.codeReview !== null ? msg.codeReview.lastViewedFile : null, msg.refresh);
					commits.applyComparisonPreviewResponse(msg.commitHash, msg.compareWithHash, msg.fileChanges, compFileTree, msg.codeReview);
				} else {
					commits.closeCommitComparison(true);
					dialog.showError('Unable to load Commit Comparison', msg.error, null, null);
				}
				break;
			case 'copyFilePath':
				finishOrDisplayError(msg.error, 'Unable to Copy File Path to Clipboard');
				break;
			case 'copyToClipboard':
				finishOrDisplayError(msg.error, 'Unable to Copy ' + msg.type + ' to Clipboard');
				break;
			case 'createArchive':
				finishOrDisplayError(msg.error, 'Unable to Create Archive', true);
				break;
			case 'createBranch':
				refreshAndDisplayErrors(msg.errors, 'Unable to Create Branch');
				break;
			case 'createPullRequest':
				finishOrDisplayErrors(msg.errors, 'Unable to Create Pull Request', () => {
					if (msg.push) {
						commits.refresh(false);
					}
				}, true);
				break;
			case 'cleanupLocalBranches':
				refreshAndDisplayErrors(msg.errors, 'Unable to Clean Up Local Branches');
				break;
			case 'deleteBranch':
				handleResponseDeleteBranch(msg);
				break;
			case 'deleteRemote':
				refreshOrDisplayError(msg.error, 'Unable to Delete Remote', true);
				break;
			case 'deleteRemoteBranch':
				refreshOrDisplayError(msg.error, 'Unable to Delete Remote Branch');
				break;
			case 'deleteTag':
				refreshOrDisplayError(msg.error, 'Unable to Delete Tag');
				break;
			case 'deleteUserDetails':
				finishOrDisplayErrors(msg.errors, 'Unable to Remove Git User Details', () => commits.requestLoadConfig(), true);
				break;
			case 'dropCommit':
				refreshOrDisplayError(msg.error, 'Unable to Drop Commit');
				break;
			case 'rewordCommit':
				refreshOrDisplayError(msg.error, 'Unable to Reword Commit');
				break;
			case 'editCommitAuthor':
				refreshOrDisplayError(msg.error, 'Unable to Edit Commit Author');
				break;
			case 'squashCommits':
				refreshOrDisplayError(msg.error, 'Unable to Squash Commits');
				break;
			case 'dropStash':
				refreshOrDisplayError(msg.error, 'Unable to Drop Stash');
				break;
			case 'editRemote':
				refreshOrDisplayError(msg.error, 'Unable to Save Changes to Remote', true);
				break;
			case 'editUserDetails':
				finishOrDisplayErrors(msg.errors, 'Unable to Save Git User Details', () => commits.requestLoadConfig(), true);
				break;
			case 'exportRepoConfig':
				refreshOrDisplayError(msg.error, 'Unable to Export Repository Configuration');
				break;
			case 'fetch':
				refreshOrDisplayError(msg.error, 'Unable to Fetch from Remote(s)');
				break;
			case 'fetchAvatar':
				imageResizer.resize(msg.image, (resizedImage) => {
					commits.loadAvatar(msg.email, resizedImage);
				});
				break;
			case 'fetchIntoLocalBranch':
				refreshOrDisplayError(msg.error, 'Unable to Fetch into Local Branch');
				break;
			case 'loadCommits':
				commits.processLoadCommitsResponse(msg);
				break;
			case 'loadConfig':
				commits.processLoadConfig(msg);
				break;
			case 'loadRepoInfo':
				commits.processLoadRepoInfoResponse(msg);
				break;
			case 'loadRepos':
				commits.loadRepos(msg.repos, msg.lastActiveRepo, msg.loadViewTo);
				break;
			case 'merge':
				refreshOrDisplayError(msg.error, 'Unable to Merge ' + msg.actionOn);
				break;
			case 'openExtensionSettings':
				finishOrDisplayError(msg.error, 'Unable to Open Extension Settings');
				break;
			case 'openExternalDirDiff':
				finishOrDisplayError(msg.error, 'Unable to Open External Directory Diff', true);
				break;
			case 'openExternalUrl':
				finishOrDisplayError(msg.error, 'Unable to Open External URL');
				break;
			case 'openFile':
				finishOrDisplayError(msg.error, 'Unable to Open File');
				break;
			case 'popStash':
				refreshOrDisplayError(msg.error, 'Unable to Pop Stash');
				break;
			case 'pruneRemote':
				refreshOrDisplayError(msg.error, 'Unable to Prune Remote');
				break;
			case 'setRemoteDefaultBranch':
				refreshOrDisplayError(msg.error, 'Unable to Set Remote Default Branch');
				break;
			case 'pullBranch':
				refreshOrDisplayError(msg.error, 'Unable to Pull Branch');
				break;
			case 'pushBranch':
				if (msg.errors.some((e) => e !== null && (e.includes('behind') || e.includes('Updates were rejected')))) {
					handleResponsePushBranchBehindRemote(msg.repo, msg.branchName, msg.remotes, msg.setUpstream, msg.errors);
				} else {
					refreshAndDisplayErrors(msg.errors, 'Unable to Push Branch', msg.willUpdateBranchConfig);
				}
				break;
			case 'pushStash':
				refreshOrDisplayError(msg.error, 'Unable to Stash Uncommitted Changes');
				break;
			case 'pushTag':
				if (msg.errors.length === 1 && isExtensionErrorInfo(msg.errors[0], GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote)) {
					handleResponsePushTagCommitNotOnRemote(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.errors[0]!);
				} else {
					refreshAndDisplayErrors(msg.errors, 'Unable to Push Tag');
				}
				break;
			case 'rebase':
				if (msg.error === null) {
					if (msg.interactive) {
						dialog.closeActionRunning();
					} else {
						commits.refresh(false);
					}
				} else {
					dialog.showError(
						'Unable to Rebase current branch on ' + msg.actionOn,
						msg.error,
						null,
						() => commits.refresh(false)
					);
				}
				break;
			case 'repoInProgressAction':
				if (msg.error === null) {
					commits.refresh(false);
				} else {
					dialog.showError(
						msg.action === GG.GitRepoInProgressAction.Continue
							? 'Unable to Continue Repository Operation'
							: 'Unable to Abort Repository Operation',
						msg.error,
						null,
						() => commits.refresh(false)
					);
				}
				break;
			case 'refresh':
				commits.refresh(false);
				break;
			case 'renameBranch':
				refreshOrDisplayError(msg.error, 'Unable to Rename Branch');
				break;
			case 'resetFileToRevision':
				refreshOrDisplayError(msg.error, 'Unable to Reset File to Revision');
				break;
			case 'resetToCommit':
				refreshOrDisplayError(msg.error, 'Unable to Reset to Commit');
				break;
			case 'revertCommit':
				refreshOrDisplayError(msg.error, 'Unable to Revert Commit');
				break;
			case 'resolveSidebarTagContext':
				commits.processResolveSidebarTagContext(msg);
				break;
			case 'setGlobalViewState':
				finishOrDisplayError(msg.error, 'Unable to save the Global View State');
				break;
			case 'setColumnVisibility':
				finishOrDisplayError(msg.error, 'Unable to save the Committed / ID column visibility');
				break;
			case 'setWorkspaceViewState':
				finishOrDisplayError(msg.error, 'Unable to save the Workspace View State');
				break;
			case 'startCodeReview':
				if (msg.error === null) {
					commits.startCodeReview(msg.commitHash, msg.compareWithHash, msg.codeReview);
				} else {
					dialog.showError('Unable to Start Code Review', msg.error, null, null);
				}
				break;
			case 'tagDetails':
				if (msg.details !== null) {
					commits.renderTagDetails(msg.tagName, msg.commitHash, msg.details);
				} else {
					dialog.showError('Unable to retrieve Tag Details', msg.error, null, null);
				}
				break;
			case 'sidebarBatchRefAction':
				handleSidebarBatchRefActionResponse(msg);
				break;
			case 'updateCodeReview':
				if (msg.error !== null) {
					dialog.showError('Unable to update Code Review', msg.error, null, null);
				}
				break;
			case 'viewDiff':
				finishOrDisplayError(msg.error, 'Unable to View Diff');
				break;
			case 'getFullDiffContent':
				commits.renderFullDiffContent(msg.error !== null ? null : {
					diff: msg.diff,
					oldContent: msg.oldContent,
					newContent: msg.newContent,
					oldExists: msg.oldExists,
					newExists: msg.newExists
				});
				break;
			case 'viewDiffWithWorkingFile':
				finishOrDisplayError(msg.error, 'Unable to View Diff with Working File');
				break;
			case 'viewFileAtRevision':
				finishOrDisplayError(msg.error, 'Unable to View File at Revision');
				break;
			case 'viewScm':
				finishOrDisplayError(msg.error, 'Unable to open the Source Control View');
				break;
		}
	});
}

function handleResponseDeleteBranch(msg: GG.ResponseDeleteBranch) {
	if (msg.errors.length > 0 && msg.errors[0] !== null && msg.errors[0].includes('git branch -D')) {
		dialog.showConfirmation('The branch <b><i>' + escapeHtml(msg.branchName) + '</i></b> is not fully merged. Would you like to force delete it?', 'Yes, force delete branch', () => {
			runAction({ command: 'deleteBranch', repo: msg.repo, branchName: msg.branchName, forceDelete: true, deleteOnRemotes: msg.deleteOnRemotes }, 'Deleting Branch');
		}, { type: TargetType.Repo });
	} else {
		refreshAndDisplayErrors(msg.errors, 'Unable to Delete Branch');
	}
}

function handleResponsePushTagCommitNotOnRemote(repo: string, tagName: string, remotes: string[], commitHash: string, error: string) {
	const remotesNotContainingCommit: string[] = parseExtensionErrorInfo(error, GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote);

	const html = '<span class="dialogAlert">' + SVG_ICONS.alert + 'Warning: Commit is not on Remote' + (remotesNotContainingCommit.length > 1 ? 's ' : ' ') + '</span><br>' +
		'<span class="messageContent">' +
		'<p style="margin:0 0 6px 0;">The tag <b><i>' + escapeHtml(tagName) + '</i></b> is on a commit that isn\'t on any known branch on the remote' + (remotesNotContainingCommit.length > 1 ? 's' : '') + ' ' + formatCommaSeparatedList(remotesNotContainingCommit.map((remote) => '<b><i>' + escapeHtml(remote) + '</i></b>')) + '.</p>' +
		'<p style="margin:0;">Would you like to proceed to push the tag to the remote' + (remotes.length > 1 ? 's' : '') + ' ' + formatCommaSeparatedList(remotes.map((remote) => '<b><i>' + escapeHtml(remote) + '</i></b>')) + ' anyway?</p>' +
		'</span>';

	dialog.showForm(html, [{ type: DialogInputType.Checkbox, name: 'Always Proceed', value: false }], 'Proceed to Push', (values) => {
		if (<boolean>values[0]) {
			updateGlobalViewState('pushTagSkipRemoteCheck', true);
		}
		runAction({
			command: 'pushTag',
			repo: repo,
			tagName: tagName,
			remotes: remotes,
			commitHash: commitHash,
			skipRemoteCheck: true
		}, 'Pushing Tag');
	}, { type: TargetType.Repo }, 'Cancel', null, true);
}

function handleResponsePushBranchBehindRemote(repo: string, branchName: string, remotes: string[], setUpstream: boolean, errors: GG.ErrorInfo[]) {
	const reducedErrors = reduceErrorInfos(errors);

	// Check if it's a "behind" error (contains keywords from git rejection message)
	const isBehindError = reducedErrors.error !== null &&
		(reducedErrors.error.includes('Updates were rejected') ||
		 reducedErrors.error.includes('failed to push') ||
		 reducedErrors.error.includes('behind'));

	if (!isBehindError || reducedErrors.partialOrCompleteSuccess) {
		// Not a "behind" error or partial success - use normal flow
		refreshAndDisplayErrors(errors, 'Unable to Push Branch', false);
		return;
	}

	// Show dialog with Force Push option
	const html = '<span class="dialogAlert">' + SVG_ICONS.alert + 'Error: Unable to Push Branch</span>' +
		'<br><span class="messageContent errorContent">' +
		escapeHtml(reducedErrors.error!).split('\n').join('<br>') +
		'</span><br><br><span style="font-size: 0.9em;">You can force push to override the remote branch, but this may cause issues if others are working on this branch.</span>';

	dialog.showForm(
		html,
		[],
		'Force Push',
		() => {
			// Retry with force-with-lease mode
			runAction({
				command: 'pushBranch',
				repo: repo,
				branchName: branchName,
				remotes: remotes,
				setUpstream: setUpstream,
				mode: GG.GitPushBranchMode.ForceWithLease,
				willUpdateBranchConfig: false
			}, 'Force Pushing Branch');
		},
		null,
		'Cancel',
		null,
		true
	);
}

function handleSidebarBatchRefActionResponse(msg: GG.ResponseSidebarBatchRefAction) {
	dialog.closeActionRunning();
	const failed = msg.results.filter((result) => result.error !== null);
	if (failed.length > 0) {
		const summary = failed.map((result) => '[' + result.type + '] ' + result.name + ': ' + result.error).join('\n\n');
		dialog.showError('Some selected actions failed (' + failed.length + '/' + msg.results.length + ')', summary, null, null);
	}
	const successCount = msg.results.length - failed.length;
	if (successCount > 0 && msg.action !== GG.SidebarBatchRefActionType.Archive) {
		commits.refresh(false);
	}
}

function refreshOrDisplayError(error: GG.ErrorInfo, errorMessage: string, configChanges: boolean = false) {
	if (error === null) {
		commits.refresh(false, configChanges);
	} else {
		dialog.showError(errorMessage, error, null, null);
	}
}

function refreshAndDisplayErrors(errors: GG.ErrorInfo[], errorMessage: string, configChanges: boolean = false) {
	const reducedErrors = reduceErrorInfos(errors);
	if (reducedErrors.error !== null) {
		dialog.showError(errorMessage, reducedErrors.error, null, null);
	}
	if (reducedErrors.partialOrCompleteSuccess) {
		commits.refresh(false, configChanges);
	} else if (configChanges) {
		commits.requestLoadConfig();
	}
}

function finishOrDisplayError(error: GG.ErrorInfo, errorMessage: string, dismissActionRunning: boolean = false) {
	if (error !== null) {
		dialog.showError(errorMessage, error, null, null);
	} else if (dismissActionRunning) {
		dialog.closeActionRunning();
	}
}

function finishOrDisplayErrors(errors: GG.ErrorInfo[], errorMessage: string, partialOrCompleteSuccessCallback: () => void, dismissActionRunning: boolean = false) {
	const reducedErrors = reduceErrorInfos(errors);
	finishOrDisplayError(reducedErrors.error, errorMessage, dismissActionRunning);
	if (reducedErrors.partialOrCompleteSuccess) {
		partialOrCompleteSuccessCallback();
	}
}

function reduceErrorInfos(errors: GG.ErrorInfo[]) {
	let error: GG.ErrorInfo = null, partialOrCompleteSuccess = false;
	for (let i = 0; i < errors.length; i++) {
		if (errors[i] !== null) {
			error = error !== null ? error + '\n\n' + errors[i] : errors[i];
		} else {
			partialOrCompleteSuccess = true;
		}
	}

	return {
		error: error,
		partialOrCompleteSuccess: partialOrCompleteSuccess
	};
}

function isExtensionErrorInfo(error: GG.ErrorInfo, prefix: GG.ErrorInfoExtensionPrefix) {
	return error !== null && error.startsWith(prefix);
}

function parseExtensionErrorInfo(error: string, prefix: GG.ErrorInfoExtensionPrefix) {
	return JSON.parse(error.substring(prefix.length));
}
