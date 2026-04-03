interface SettingsWidgetState {
	readonly currentRepo: string | null;
	readonly scrollTop: number;
}

/**
 * Implements the Commits View's Settings Widget.
 */
class SettingsWidget {
	private readonly view: CommitsView;

	private currentRepo: string | null = null;
	private repo: Readonly<GG.GitRepoState> | null = null;
	private config: Readonly<GG.GitRepoConfig> | null = null;
	private loading: boolean = false;
	private scrollTop: number = 0;

	private readonly widgetElem: HTMLElement;
	private readonly contentsElem: HTMLElement;
	private readonly loadingElem: HTMLElement;

	/**
	 * Construct a new SettingsWidget instance.
	 * @param view The Commits View that the SettingsWidget is for.
	 * @returns The SettingsWidget instance.
	 */
	constructor(view: CommitsView) {
		this.view = view;

		this.widgetElem = document.createElement('div');
		this.widgetElem.id = 'settingsWidget';
		this.widgetElem.innerHTML = '<h2>Repository Settings</h2><div id="settingsContent"></div><div id="settingsLoading"></div><div id="settingsClose"></div>';
		document.body.appendChild(this.widgetElem);

		observeElemScroll('settingsWidget', this.scrollTop, (scrollTop) => {
			this.scrollTop = scrollTop;
		}, () => {
			if (this.currentRepo !== null) {
				this.view.saveState();
			}
		});

		this.contentsElem = document.getElementById('settingsContent')!;
		this.loadingElem = document.getElementById('settingsLoading')!;

		const settingsClose = document.getElementById('settingsClose')!;
		settingsClose.innerHTML = SVG_ICONS.close;
		settingsClose.addEventListener('click', () => this.close());
	}

	/**
	 * Show the Settings Widget.
	 * @param currentRepo The repository that is currently loaded in the view.
	 * @param isInitialLoad Is this the initial load of the Setting Widget, or is it being shown when restoring a previous state.
	 * @param scrollTop The scrollTop the Settings Widget should initially be set to.
	 */
	public show(currentRepo: string, isInitialLoad: boolean = true, scrollTop: number = 0) {
		if (this.currentRepo !== null) return;
		this.currentRepo = currentRepo;
		this.scrollTop = scrollTop;
		alterClass(this.widgetElem, CLASS_TRANSITION, isInitialLoad);
		this.widgetElem.classList.add(CLASS_ACTIVE);
		this.view.saveState();
		this.refresh();
		if (isInitialLoad) {
			this.view.requestLoadConfig();
		}
	}

	/**
	 * Refresh the Settings Widget after an action affecting it's content has completed.
	 */
	public refresh() {
		if (this.currentRepo === null) return;
		this.repo = this.view.getRepoState(this.currentRepo);
		this.config = this.view.getRepoConfig();
		this.loading = this.view.isConfigLoading();
		this.render();
	}

	/**
	 * Close the Settings Widget, sliding it up out of view.
	 */
	public close() {
		if (this.currentRepo === null) return;
		this.currentRepo = null;
		this.repo = null;
		this.config = null;
		this.loading = false;
		this.widgetElem.classList.add(CLASS_TRANSITION);
		this.widgetElem.classList.remove(CLASS_ACTIVE);
		this.widgetElem.classList.remove(CLASS_LOADING);
		this.contentsElem.innerHTML = '';
		this.loadingElem.innerHTML = '';
		this.view.saveState();
	}


	/* State */

	/**
	 * Get the current state of the Settings Widget.
	 */
	public getState(): SettingsWidgetState {
		return {
			currentRepo: this.currentRepo,
			scrollTop: this.scrollTop
		};
	}

	/**
	 * Restore the Settings Widget to an existing state.
	 * @param state The previous Settings Widget state.
	 */
	public restoreState(state: SettingsWidgetState) {
		if (state.currentRepo === null) return;
		this.show(state.currentRepo, false, state.scrollTop);
	}

	/**
	 * Is the Settings Widget currently visible.
	 * @returns TRUE => The Settings Widget is visible, FALSE => The Settings Widget is not visible
	 */
	public isVisible() {
		return this.currentRepo !== null;
	}


	/* Render Methods */

	/**
	 * Render the Settings Widget.
	 */
	private render() {
		if (this.currentRepo !== null && this.repo !== null) {
			const escapedRepoName = escapeHtml(this.repo.name || getRepoName(this.currentRepo));

			const initialBranchesLocallyConfigured = this.repo.onRepoLoadShowCheckedOutBranch !== GG.BooleanOverride.Default || this.repo.onRepoLoadShowSpecificBranches !== null;
			const initialBranches: string[] = [];
			if (getOnRepoLoadShowCheckedOutBranch(this.repo.onRepoLoadShowCheckedOutBranch)) {
				initialBranches.push('Checked Out');
			}
			const branchOptions = this.view.getBranchOptions();
			getOnRepoLoadShowSpecificBranches(this.repo.onRepoLoadShowSpecificBranches).forEach((branch) => {
				const option = branchOptions.find((option) => option.value === branch);
				if (option) {
					initialBranches.push(option.name);
				}
			});
			const initialBranchesStr = initialBranches.length > 0
				? escapeHtml(formatCommaSeparatedList(initialBranches))
				: 'Show All';

			let html = '<div class="settingsSection general"><h3>General</h3>' +
				'<table>' +
				'<tr class="lineAbove"><td class="left">Name:</td><td class="leftWithEllipsis" title="' + escapedRepoName + (this.repo.name === null ? ' (Default Name from the File System)' : '') + '">' + escapedRepoName + '</td><td class="btns right"><div id="editRepoName" title="Edit Name' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (this.repo.name !== null ? ' <div id="deleteRepoName" title="Delete Name' + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
				'<tr class="lineAbove lineBelow"><td class="left">Initial Branches:</td><td class="leftWithEllipsis" title="' + initialBranchesStr + ' (' + (initialBranchesLocallyConfigured ? 'Local' : 'Global') + ')">' + initialBranchesStr + '</td><td class="btns right"><div id="editInitialBranches" title="Edit Initial Branches' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (initialBranchesLocallyConfigured ? ' <div id="clearInitialBranches" title="Clear Initial Branches' + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
				'</table>' +
				'<label id="settingsShowStashes"><input type="checkbox" id="settingsShowStashesCheckbox" tabindex="-1"><span class="customCheckbox"></span>Show Stashes</label><br/>' +
				'<label id="settingsIncludeCommitsMentionedByReflogs"><input type="checkbox" id="settingsIncludeCommitsMentionedByReflogsCheckbox" tabindex="-1"><span class="customCheckbox"></span>Include commits only mentioned by reflogs</label><span class="settingsWidgetInfo" title="Only applies when showing all branches.">' + SVG_ICONS.info + '</span><br/>' +
				'<label id="settingsOnlyFollowFirstParent"><input type="checkbox" id="settingsOnlyFollowFirstParentCheckbox" tabindex="-1"><span class="customCheckbox"></span>Only follow the first parent of commits</label><span class="settingsWidgetInfo" title="Instead of following all parents of commits, only follow the first parent when discovering the commits to load.">' + SVG_ICONS.info + '</span>' +
				'</div>';

			let userNameSet = false, userEmailSet = false;
			if (this.config !== null) {
				html += '<div class="settingsSection centered"><h3>User Details</h3>';
				const userName = this.config.user.name, userEmail = this.config.user.email;
				userNameSet = userName.local !== null || userName.global !== null;
				userEmailSet = userEmail.local !== null || userEmail.global !== null;
				if (userNameSet || userEmailSet) {
					const escapedUserName = escapeHtml(userName.local ?? userName.global ?? 'Not Set');
					const escapedUserEmail = escapeHtml(userEmail.local ?? userEmail.global ?? 'Not Set');
					html += '<table>' +
						'<tr><td class="left">User Name:</td><td class="leftWithEllipsis" title="' + escapedUserName + (userNameSet ? ' (' + (userName.local !== null ? 'Local' : 'Global') + ')' : '') + '">' + escapedUserName + '</td></tr>' +
						'<tr><td class="left">User Email:</td><td class="leftWithEllipsis" title="' + escapedUserEmail + (userEmailSet ? ' (' + (userEmail.local !== null ? 'Local' : 'Global') + ')' : '') + '">' + escapedUserEmail + '</td></tr>' +
						'</table>' +
						'<div class="settingsSectionButtons"><div id="editUserDetails" class="editBtn">' + SVG_ICONS.pencil + 'Edit</div><div id="removeUserDetails" class="removeBtn">' + SVG_ICONS.close + 'Remove</div></div>';
				} else {
					html += '<span>User Details (such as name and email) are used by Git to record the Author and Committer of commit objects.</span>' +
						'<div class="settingsSectionButtons"><div id="editUserDetails" class="addBtn">' + SVG_ICONS.plus + 'Add User Details</div></div>';
				}
				html += '</div>';

				html += '<div class="settingsSection"><h3>Remote Configuration</h3><table><tr><th>Remote</th><th>URL</th><th>Type</th><th>Action</th></tr>';
				if (this.config.remotes.length > 0) {
					const hideRemotes = this.repo.hideRemotes;
					this.config.remotes.forEach((remote, i) => {
						const hidden = hideRemotes.includes(remote.name);
						const fetchUrl = escapeHtml(remote.url || 'Not Set'), pushUrl = escapeHtml(remote.pushUrl || remote.url || 'Not Set');
						html += '<tr class="lineAbove">' +
							'<td class="left" rowspan="2"><span class="hideRemoteBtn" data-index="' + i + '" title="Click to ' + (hidden ? 'show' : 'hide') + ' branches of this remote.">' + (hidden ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen) + '</span>' + escapeHtml(remote.name) + '</td>' +
							'<td class="leftWithEllipsis" title="Fetch URL: ' + fetchUrl + '">' + fetchUrl + '</td><td>Fetch</td>' +
							'<td class="btns remoteBtns" rowspan="2" data-index="' + i + '"><div class="fetchRemote" title="Fetch from Remote' + ELLIPSIS + '">' + SVG_ICONS.download + '</div> <div class="pruneRemote" title="Prune Remote' + ELLIPSIS + '">' + SVG_ICONS.branch + '</div><br><div class="setDefaultRemoteBranch" title="Set Default Branch' + ELLIPSIS + '">' + SVG_ICONS.branch + '</div><br><div class="editRemote" title="Edit Remote' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div> <div class="deleteRemote" title="Delete Remote' + ELLIPSIS + '">' + SVG_ICONS.close + '</div></td>' +
							'</tr><tr><td class="leftWithEllipsis" title="Push URL: ' + pushUrl + '">' + pushUrl + '</td><td>Push</td></tr>';
					});
				} else {
					html += '<tr class="lineAbove"><td colspan="4">There are no remotes configured for this repository.</td></tr>';
				}
				html += '</table><div class="settingsSectionButtons lineAbove"><div id="settingsAddRemote" class="addBtn">' + SVG_ICONS.plus + 'Add Remote</div></div></div>';
			}

			html += '<div class="settingsSection centered"><h3>Issue Linking</h3>';
			const issueLinkingConfig = this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
			if (issueLinkingConfig !== null) {
				const escapedIssue = escapeHtml(issueLinkingConfig.issue), escapedUrl = escapeHtml(issueLinkingConfig.url);
				html += '<table><tr><td class="left">Issue Regex:</td><td class="leftWithEllipsis" title="' + escapedIssue + '">' + escapedIssue + '</td></tr><tr><td class="left">Issue URL:</td><td class="leftWithEllipsis" title="' + escapedUrl + '">' + escapedUrl + '</td></tr></table>' +
					'<div class="settingsSectionButtons"><div id="editIssueLinking" class="editBtn">' + SVG_ICONS.pencil + 'Edit</div><div id="removeIssueLinking" class="removeBtn">' + SVG_ICONS.close + 'Remove</div></div>';
			} else {
				html += '<span>Issue Linking converts issue numbers in commit &amp; tag messages into hyperlinks, that open the issue in your issue tracking system. If a branch\'s name contains an issue number, the issue can be viewed via the branch\'s context menu.</span>' +
					'<div class="settingsSectionButtons"><div id="editIssueLinking" class="addBtn">' + SVG_ICONS.plus + 'Add Issue Linking</div></div>';
			}
			html += '</div>';

			if (this.config !== null) {
				html += '<div class="settingsSection centered"><h3>Pull Request Creation</h3>';
				const pullRequestConfig = this.repo.pullRequestConfig;
				if (pullRequestConfig !== null) {
					const provider = escapeHtml((pullRequestConfig.provider === GG.PullRequestProvider.Bitbucket
						? 'Bitbucket'
						: pullRequestConfig.provider === GG.PullRequestProvider.Custom
							? pullRequestConfig.custom.name
							: pullRequestConfig.provider === GG.PullRequestProvider.GitHub
								? 'GitHub'
								: 'GitLab'
					) + ' (' + pullRequestConfig.hostRootUrl + ')');
					const source = escapeHtml(pullRequestConfig.sourceOwner + '/' + pullRequestConfig.sourceRepo + ' (' + pullRequestConfig.sourceRemote + ')');
					const destination = escapeHtml(pullRequestConfig.destOwner + '/' + pullRequestConfig.destRepo + (pullRequestConfig.destRemote !== null ? ' (' + pullRequestConfig.destRemote + ')' : ''));
					const destinationBranch = escapeHtml(pullRequestConfig.destBranch);
					html += '<table><tr><td class="left">Provider:</td><td class="leftWithEllipsis" title="' + provider + '">' + provider + '</td></tr>' +
						'<tr><td class="left">Source Repo:</td><td class="leftWithEllipsis" title="' + source + '">' + source + '</td></tr>' +
						'<tr><td class="left">Destination Repo:</td><td class="leftWithEllipsis" title="' + destination + '">' + destination + '</td></tr>' +
						'<tr><td class="left">Destination Branch:</td><td class="leftWithEllipsis" title="' + destinationBranch + '">' + destinationBranch + '</td></tr></table>' +
						'<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="editBtn">' + SVG_ICONS.pencil + 'Edit</div><div id="removePullRequestIntegration" class="removeBtn">' + SVG_ICONS.close + 'Remove</div></div>';
				} else {
					html += '<span>Pull Request Creation automates the opening and pre-filling of a Pull Request form, directly from a branch\'s context menu.</span>' +
						'<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="addBtn">' + SVG_ICONS.plus + 'Configure "Pull Request Creation" Integration</div></div>';
				}
				html += '</div>';
			}

			html += '<div class="settingsSection"><h3>Commits Configuration</h3><div class="settingsSectionButtons">' +
				'<div id="openExtensionSettings">' + SVG_ICONS.gear + 'Open Commits Extension Settings</div><br/>' +
				'<div id="exportRepositoryConfig">' + SVG_ICONS.package + 'Export Repository Configuration</div>' +
				'</div></div>';

			this.contentsElem.innerHTML = html;

			document.getElementById('editRepoName')!.addEventListener('click', () => {
				if (this.currentRepo === null || this.repo === null) return;
				dialog.showForm('Specify a Name for this Repository:', [
					{ type: DialogInputType.Text, name: 'Name', default: this.repo.name || '', placeholder: getRepoName(this.currentRepo) }
				], 'Save Name', (values) => {
					if (this.currentRepo === null) return;
					this.view.saveRepoStateValue(this.currentRepo, 'name', <string>values[0] || null);
					this.view.renderRepoDropdownOptions();
					this.render();
				}, null);
			});

			if (this.repo.name !== null) {
				document.getElementById('deleteRepoName')!.addEventListener('click', () => {
					if (this.currentRepo === null || this.repo === null || this.repo.name === null) return;
					dialog.showConfirmation('Are you sure you want to delete the manually configured name <b><i>' + escapeHtml(this.repo.name) + '</i></b> for this repository, and use the default name from the File System <b><i>' + escapeHtml(getRepoName(this.currentRepo)) + '</i></b>?', 'Yes, delete', () => {
						if (this.currentRepo === null) return;
						this.view.saveRepoStateValue(this.currentRepo, 'name', null);
						this.view.renderRepoDropdownOptions();
						this.render();
					}, null);
				});
			}

			document.getElementById('editInitialBranches')!.addEventListener('click', () => {
				if (this.repo === null) return;
				const showCheckedOutBranch = getOnRepoLoadShowCheckedOutBranch(this.repo.onRepoLoadShowCheckedOutBranch);
				const showSpecificBranches = getOnRepoLoadShowSpecificBranches(this.repo.onRepoLoadShowSpecificBranches);
				dialog.showForm('<b>Configure Initial Branches</b><p style="margin:6px 0;">Configure the branches that are initially shown when this repository is loaded in the Commits View.</p><p style="font-size:12px; margin:6px 0 0 0;">Note: When "Checked Out Branch" is Disabled, and no "Specific Branches" are selected, all branches will be shown.</p>', [
					{ type: DialogInputType.Checkbox, name: 'Checked Out Branch', value: showCheckedOutBranch },
					{ type: DialogInputType.Select, name: 'Specific Branches', options: this.view.getBranchOptions(), defaults: showSpecificBranches, multiple: true }
				], 'Save Configuration', (values) => {
					if (this.currentRepo === null) return;
					if (showCheckedOutBranch !== values[0] || !arraysStrictlyEqualIgnoringOrder(showSpecificBranches, <string[]>values[1])) {
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowCheckedOutBranch', values[0] ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowSpecificBranches', <string[]>values[1]);
						this.render();
					}
				}, null, 'Cancel', null, false);
			});

			if (initialBranchesLocallyConfigured) {
				document.getElementById('clearInitialBranches')!.addEventListener('click', () => {
					dialog.showConfirmation('Are you sure you want to clear the branches that are initially shown when this repository is loaded in the Commits View?', 'Yes, clear', () => {
						if (this.currentRepo === null) return;
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowCheckedOutBranch', GG.BooleanOverride.Default);
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowSpecificBranches', null);
						this.render();
					}, null);
				});
			}

			const showStashesElem = <HTMLInputElement>document.getElementById('settingsShowStashesCheckbox');
			showStashesElem.checked = getShowStashes(this.repo.showStashes);
			showStashesElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsShowStashesCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'showStashes', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			const includeCommitsMentionedByReflogsElem = <HTMLInputElement>document.getElementById('settingsIncludeCommitsMentionedByReflogsCheckbox');
			includeCommitsMentionedByReflogsElem.checked = getIncludeCommitsMentionedByReflogs(this.repo.includeCommitsMentionedByReflogs);
			includeCommitsMentionedByReflogsElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsIncludeCommitsMentionedByReflogsCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'includeCommitsMentionedByReflogs', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			const settingsOnlyFollowFirstParentElem = <HTMLInputElement>document.getElementById('settingsOnlyFollowFirstParentCheckbox');
			settingsOnlyFollowFirstParentElem.checked = getOnlyFollowFirstParent(this.repo.onlyFollowFirstParent);
			settingsOnlyFollowFirstParentElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsOnlyFollowFirstParentCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'onlyFollowFirstParent', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			if (this.config !== null) {
				document.getElementById('editUserDetails')!.addEventListener('click', () => {
					if (this.config === null) return;
					const userName = this.config.user.name, userEmail = this.config.user.email;
					dialog.showForm('Set the user name and email used by Git to record the Author and Committer of commit objects:', [
						{ type: DialogInputType.Text, name: 'User Name', default: userName.local ?? userName.global ?? '', placeholder: null },
						{ type: DialogInputType.Text, name: 'User Email', default: userEmail.local ?? userEmail.global ?? '', placeholder: null },
						{ type: DialogInputType.Checkbox, name: 'Use Globally', value: userName.local === null && userEmail.local === null, info: 'Use the "User Name" and "User Email" globally for all Git repositories (it can be overridden per repository).' }
					], 'Set User Details', (values) => {
						if (this.currentRepo === null) return;
						const useGlobally = <boolean>values[2];
						runAction({
							command: 'editUserDetails',
							repo: this.currentRepo,
							name: <string>values[0],
							email: <string>values[1],
							location: useGlobally ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local,
							deleteLocalName: useGlobally && userName.local !== null,
							deleteLocalEmail: useGlobally && userEmail.local !== null
						}, 'Setting User Details');
					}, null);
				});

				if (userNameSet || userEmailSet) {
					document.getElementById('removeUserDetails')!.addEventListener('click', () => {
						if (this.config === null) return;
						const userName = this.config.user.name, userEmail = this.config.user.email;
						const isGlobal = userName.local === null && userEmail.local === null;
						dialog.showConfirmation('Are you sure you want to remove the <b>' + (isGlobal ? 'globally' : 'locally') + ' configured</b> user name and email, which are used by Git to record the Author and Committer of commit objects?', 'Yes, remove', () => {
							if (this.currentRepo === null) return;
							runAction({
								command: 'deleteUserDetails',
								repo: this.currentRepo,
								name: (isGlobal ? userName.global : userName.local) !== null,
								email: (isGlobal ? userEmail.global : userEmail.local) !== null,
								location: isGlobal ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local
							}, 'Removing User Details');
						}, null);
					});
				}

				const pushUrlPlaceholder = 'Leave blank to use the Fetch URL';
				document.getElementById('settingsAddRemote')!.addEventListener('click', () => {
					dialog.showForm('Add a new remote to this repository:', [
						{ type: DialogInputType.Text, name: 'Name', default: '', placeholder: null },
						{ type: DialogInputType.Text, name: 'Fetch URL', default: '', placeholder: null },
						{ type: DialogInputType.Text, name: 'Push URL', default: '', placeholder: pushUrlPlaceholder },
						{ type: DialogInputType.Checkbox, name: 'Fetch Immediately', value: true }
					], 'Add Remote', (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'addRemote', repo: this.currentRepo, name: <string>values[0], url: <string>values[1], pushUrl: <string>values[2] !== '' ? <string>values[2] : null, fetch: <boolean>values[3] }, 'Adding Remote');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('editRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showForm('Edit the remote <b><i>' + escapeHtml(remote.name) + '</i></b>:', [
						{ type: DialogInputType.Text, name: 'Name', default: remote.name, placeholder: null },
						{ type: DialogInputType.Text, name: 'Fetch URL', default: remote.url !== null ? remote.url : '', placeholder: null },
						{ type: DialogInputType.Text, name: 'Push URL', default: remote.pushUrl !== null ? remote.pushUrl : '', placeholder: pushUrlPlaceholder }
					], 'Save Changes', (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'editRemote', repo: this.currentRepo, nameOld: remote.name, nameNew: <string>values[0], urlOld: remote.url, urlNew: <string>values[1] !== '' ? <string>values[1] : null, pushUrlOld: remote.pushUrl, pushUrlNew: <string>values[2] !== '' ? <string>values[2] : null }, 'Saving Changes to Remote');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('deleteRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showConfirmation('Are you sure you want to delete the remote <b><i>' + escapeHtml(remote.name) + '</i></b>?', 'Yes, delete', () => {
						if (this.currentRepo === null) return;
						runAction({ command: 'deleteRemote', repo: this.currentRepo, name: remote.name }, 'Deleting Remote');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('fetchRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showForm('Are you sure you want to fetch from the remote <b><i>' + escapeHtml(remote.name) + '</i></b>?', [
						{ type: DialogInputType.Checkbox, name: 'Prune', value: initialState.config.dialogDefaults.fetchRemote.prune, info: 'Before fetching, remove any remote-tracking references that no longer exist on the remote.' },
						{ type: DialogInputType.Checkbox, name: 'Prune Tags', value: initialState.config.dialogDefaults.fetchRemote.pruneTags, info: 'Before fetching, remove any local tags that no longer exist on the remote. Requires Git >= 2.17.0, and "Prune" to be enabled.' }
					], 'Yes, fetch', (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'fetch', repo: this.currentRepo, name: remote.name, prune: <boolean>values[0], pruneTags: <boolean>values[1] }, 'Fetching from Remote');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('pruneRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showConfirmation('Are you sure you want to prune remote-tracking references that no longer exist on the remote <b><i>' + escapeHtml(remote.name) + '</i></b>?', 'Yes, prune', () => {
						if (this.currentRepo === null) return;
						runAction({ command: 'pruneRemote', repo: this.currentRepo, name: remote.name }, 'Pruning Remote');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('setDefaultRemoteBranch', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					const prefix = 'remotes/' + remote.name + '/';
					const branchOptions = Array.from(new Set(this.view.getBranches()
						.filter((branch) => branch.startsWith(prefix) && branch !== prefix + 'HEAD')
						.map((branch) => branch.substring(prefix.length))))
						.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
						.map((branch) => ({ name: branch, value: branch }));
					if (branchOptions.length === 0) {
						dialog.showError('Unable to Set Remote Default Branch', 'No remote-tracking branches for remote "' + remote.name + '" are currently known. Fetch from this remote and try again.', null, null);
						return;
					}

					const remoteHeadTarget = this.view.getRemoteHeadTargets()[remote.name];
					const defaultBranch = typeof remoteHeadTarget === 'string' && remoteHeadTarget.startsWith(remote.name + '/')
						? remoteHeadTarget.substring(remote.name.length + 1)
						: branchOptions[0].value;
					dialog.showForm('Set the default branch (remote HEAD) for remote <b><i>' + escapeHtml(remote.name) + '</i></b>:', [
						{
							type: DialogInputType.Select,
							name: 'Branch',
							options: branchOptions,
							default: branchOptions.some((option) => option.value === defaultBranch) ? defaultBranch : branchOptions[0].value
						}
					], 'Set Default Branch', (values) => {
						if (this.currentRepo === null) return;
						runAction({
							command: 'setRemoteDefaultBranch',
							repo: this.currentRepo,
							remote: remote.name,
							branch: <string>values[0]
						}, 'Setting Remote Default Branch');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('hideRemoteBtn', 'click', (e) => {
					if (this.currentRepo === null || this.repo === null || this.config === null) return;
					const source = <HTMLElement>(<Element>e.target).closest('.hideRemoteBtn')!;
					const remote = this.config.remotes[parseInt(source.dataset.index!)].name;
					const hideRemote = !this.repo.hideRemotes.includes(remote);
					source.title = 'Click to ' + (hideRemote ? 'show' : 'hide') + ' branches of this remote.';
					source.innerHTML = hideRemote ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen;
					if (hideRemote) {
						this.repo.hideRemotes.push(remote);
					} else {
						this.repo.hideRemotes.splice(this.repo.hideRemotes.indexOf(remote), 1);
					}
					this.view.saveRepoStateValue(this.currentRepo, 'hideRemotes', this.repo.hideRemotes);
					this.view.refresh(true);
				});
			}

			document.getElementById('editIssueLinking')!.addEventListener('click', () => {
				if (this.repo === null) return;
				const issueLinkingConfig = this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
				if (issueLinkingConfig !== null) {
					this.showIssueLinkingDialog(issueLinkingConfig.issue, issueLinkingConfig.url, this.repo.issueLinkingConfig === null && globalState.issueLinkingConfig !== null, true);
				} else {
					this.showIssueLinkingDialog(null, null, false, false);
				}
			});

			if (this.repo.issueLinkingConfig !== null || globalState.issueLinkingConfig !== null) {
				document.getElementById('removeIssueLinking')!.addEventListener('click', () => {
					if (this.repo === null) return;
					const locallyConfigured = this.repo.issueLinkingConfig !== null;
					dialog.showConfirmation('Are you sure you want to remove ' + (locallyConfigured ? (globalState.issueLinkingConfig !== null ? 'the <b>locally configured</b> ' : '') + 'Issue Linking from this repository' : 'the <b>globally configured</b> Issue Linking in Commits') + '?', 'Yes, remove', () => {
						this.setIssueLinkingConfig(null, !locallyConfigured);
					}, null);
				});
			}

			if (this.config !== null) {
				document.getElementById('editPullRequestIntegration')!.addEventListener('click', () => {
					if (this.repo === null || this.config === null) return;

					if (this.config.remotes.length === 0) {
						dialog.showError('Unable to configure the "Pull Request Creation" Integration', 'The repository must have at least one remote to configure the "Pull Request Creation" Integration. There are no remotes in the current repository.', null, null);
						return;
					}

					let config: GG.DeepWriteable<GG.PullRequestConfig>;
					if (this.repo.pullRequestConfig === null) {
						let originIndex = this.config.remotes.findIndex((remote) => remote.name === 'origin');
						let sourceRemoteUrl = this.config.remotes[originIndex > -1 ? originIndex : 0].url;
						let provider: GG.PullRequestProvider;
						if (sourceRemoteUrl !== null) {
							if (sourceRemoteUrl.match(/^(https?:\/\/|git@)[^/]*github/) !== null) {
								provider = GG.PullRequestProvider.GitHub;
							} else if (sourceRemoteUrl.match(/^(https?:\/\/|git@)[^/]*gitlab/) !== null) {
								provider = GG.PullRequestProvider.GitLab;
							} else {
								provider = GG.PullRequestProvider.Bitbucket;
							}
						} else {
							provider = GG.PullRequestProvider.Bitbucket;
						}
						config = {
							provider: provider, hostRootUrl: '',
							sourceRemote: '', sourceOwner: '', sourceRepo: '',
							destRemote: '', destOwner: '', destRepo: '', destProjectId: '', destBranch: '',
							custom: null
						};
					} else {
						config = Object.assign({}, this.repo.pullRequestConfig);
					}
					this.showCreatePullRequestIntegrationDialog1(config);
				});

				if (this.repo.pullRequestConfig !== null) {
					document.getElementById('removePullRequestIntegration')!.addEventListener('click', () => {
						dialog.showConfirmation('Are you sure you want to remove the configured "Pull Request Creation" Integration?', 'Yes, remove', () => {
							this.setPullRequestConfig(null);
						}, null);
					});
				}
			}

			document.getElementById('openExtensionSettings')!.addEventListener('click', () => {
				sendMessage({ command: 'openExtensionSettings' });
			});

			document.getElementById('exportRepositoryConfig')!.addEventListener('click', () => {
				dialog.showConfirmation('Exporting the Commits Repository Configuration will generate a file that can be committed in this repository. It allows others working in this repository to use the same configuration.', 'Yes, export', () => {
					if (this.currentRepo === null) return;
					runAction({ command: 'exportRepoConfig', repo: this.currentRepo }, 'Exporting Repository Configuration');
				}, null);
			});
		}

		alterClass(this.widgetElem, CLASS_LOADING, this.loading);
		this.loadingElem.innerHTML = this.loading ? '<span>' + SVG_ICONS.loading + 'Loading ...</span>' : '';
		this.widgetElem.scrollTop = this.scrollTop;
		this.loadingElem.style.top = (this.scrollTop + (this.widgetElem.clientHeight / 2) - 12) + 'px';
	}


	/* Private Helper Methods */

	/**
	 * Save the issue linking configuration for this repository, and refresh the view so these changes are taken into affect.
	 * @param config The issue linking configuration to save.
	 * @param global Should this configuration be set globally for all repositories, or locally for this specific repository.
	 */
	public setIssueLinkingConfig(config: GG.IssueLinkingConfig | null, global: boolean) {
		if (this.currentRepo === null || this.repo === null) return;

		if (global) {
			if (this.repo.issueLinkingConfig !== null) {
				this.view.saveRepoStateValue(this.currentRepo, 'issueLinkingConfig', null);
			}
			updateGlobalViewState('issueLinkingConfig', config);
		} else {
			this.view.saveRepoStateValue(this.currentRepo, 'issueLinkingConfig', config);
		}

		this.view.refresh(true);
		this.render();
	}

	/**
	 * Save the pull request configuration for this repository.
	 * @param config The pull request configuration to save.
	 */
	public setPullRequestConfig(config: GG.PullRequestConfig | null) {
		if (this.currentRepo === null) return;
		this.view.saveRepoStateValue(this.currentRepo, 'pullRequestConfig', config);
		this.render();
	}

	/**
	 * Show the dialog allowing the user to configure the issue linking for this repository.
	 * @param defaultIssueRegex The default regular expression used to match issue numbers.
	 * @param defaultIssueUrl The default URL for the issue number to be substituted into.
	 * @param defaultUseGlobally The default value for the checkbox determining whether the issue linking configuration should be used globally (for all repositories).
	 * @param isEdit Is the dialog editing an existing issue linking configuration.
	 */
	public showIssueLinkingDialog(defaultIssueRegex: string | null, defaultIssueUrl: string | null, defaultUseGlobally: boolean, isEdit: boolean) {
		settingsWidgetShowIssueLinkingDialog(this, defaultIssueRegex, defaultIssueUrl, defaultUseGlobally, isEdit);
	}

	/**
	 * Show the first dialog for configuring the pull request integration.
	 * @param config The pull request configuration.
	 */
	public showCreatePullRequestIntegrationDialog1(config: GG.DeepWriteable<GG.PullRequestConfig>) {
		settingsWidgetShowCreatePullRequestIntegrationDialog1(this, config);
	}

	/**
	 * Show the second dialog for configuring the pull request integration.
	 * @param config The pull request configuration.
	 */
	public showCreatePullRequestIntegrationDialog2(config: GG.DeepWriteable<GG.PullRequestConfig>) {
		settingsWidgetShowCreatePullRequestIntegrationDialog2(this, config);
	}

	/**
	 * Get the remote details corresponding to a mouse event.
	 * @param e The mouse event.
	 * @returns The details of the remote.
	 */
	private getRemoteForBtnEvent(e: Event) {
		return this.config !== null
			? this.config.remotes[parseInt((<HTMLElement>(<Element>e.target).closest('.remoteBtns')!).dataset.index!)]
			: null;
	}

	/**
	 * Automatically detect common issue number formats in the specified commits, returning the most common.
	 * @param commits The commits to analyse.
	 * @returns The regular expression of the most likely issue number format.
	 */
	public static autoDetectIssueRegex(commits: ReadonlyArray<GG.GitCommit>) {
		const patterns = ['#(\\d+)', '^(\\d+)\\.(?=\\s|$)', '^(\\d+):(?=\\s|$)', '([A-Za-z]+-\\d+)'].map((pattern) => {
			const regexp = new RegExp(pattern);
			return {
				pattern: pattern,
				matches: commits.filter((commit) => regexp.test(commit.message)).length
			};
		}).sort((a, b) => b.matches - a.matches);

		if (patterns[0].matches > 0.1 * commits.length) {
			// If the most common pattern was matched in more than 10% of commits, return the pattern
			return patterns[0].pattern;
		}
		return null;
	}
}
