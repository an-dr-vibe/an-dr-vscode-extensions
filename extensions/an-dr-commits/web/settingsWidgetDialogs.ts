function settingsWidgetShowIssueLinkingDialog(view: any, defaultIssueRegex: string | null, defaultIssueUrl: string | null, defaultUseGlobally: boolean, isEdit: boolean) {
	let html = '<b>' + (isEdit ? 'Edit Issue Linking for' : 'Add Issue Linking to') + ' this Repository</b>';
	html += '<p style="font-size:12px; margin:6px 0;">The following example links <b>#123</b> in commit messages to <b>https://github.com/mhutchie/repo/issues/123</b>:</p>';
	html += '<table style="display:inline-table; width:360px; text-align:left; font-size:12px; margin-bottom:2px;"><tr><td>Issue Regex:</td><td>#(\\d+)</td></tr><tr><td>Issue URL:</td><td>https://github.com/mhutchie/repo/issues/$1</td></tr></tbody></table>';

	if (!isEdit && defaultIssueRegex === null && defaultIssueUrl === null) {
		defaultIssueRegex = SettingsWidget.autoDetectIssueRegex(view.view.getCommits());
		if (defaultIssueRegex !== null) {
			html += '<p style="font-size:12px"><i>The prefilled Issue Regex was detected in commit messages in this repository. Review and/or correct it if necessary.</i></p>';
		}
	}

	dialog.showForm(html, [
		{ type: DialogInputType.Text, name: 'Issue Regex', default: defaultIssueRegex !== null ? defaultIssueRegex : '', placeholder: null, info: 'A regular expression that matches your issue numbers, with one or more capturing groups ( ) that will be substituted into the "Issue URL".' },
		{ type: DialogInputType.Text, name: 'Issue URL', default: defaultIssueUrl !== null ? defaultIssueUrl : '', placeholder: null, info: 'The issue\'s URL in your issue tracking system, with placeholders ($1, $2, etc.) for the groups captured ( ) in the "Issue Regex".' },
		{ type: DialogInputType.Checkbox, name: 'Use Globally', value: defaultUseGlobally, info: 'Use the "Issue Regex" and "Issue URL" for all repositories by default (it can be overridden per repository). Note: "Use Globally" is only suitable if identical Issue Linking applies to the majority of your repositories (e.g. when using JIRA or Pivotal Tracker).' }
	], 'Save', (values) => {
		let issueRegex = (<string>values[0]).trim();
		let issueUrl = (<string>values[1]).trim();
		let useGlobally = <boolean>values[2];
		let regExpParseError = null;
		try {
			if (issueRegex.indexOf('(') === -1 || issueRegex.indexOf(')') === -1) {
				regExpParseError = 'The regular expression does not contain a capturing group ( ).';
			} else if (new RegExp(issueRegex, 'gu')) {
				regExpParseError = null;
			}
		} catch (e) {
			regExpParseError = (<Error>e).message;
		}
		if (regExpParseError !== null) {
			dialog.showError('Invalid Issue Regex', regExpParseError, 'Go Back', () => {
				view.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
			});
		} else if (!(/\$([1-9][0-9]*)/.test(issueUrl))) {
			dialog.showError('Invalid Issue URL', 'The Issue URL does not contain any placeholders ($1, $2, etc.) for the issue number components captured in the Issue Regex.', 'Go Back', () => {
				view.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
			});
		} else {
			view.setIssueLinkingConfig({ issue: issueRegex, url: issueUrl }, useGlobally);
		}
	}, null, 'Cancel', null, false);
}

function settingsWidgetShowCreatePullRequestIntegrationDialog1(view: any, config: GG.DeepWriteable<GG.PullRequestConfig>) {
	if (view.config === null) return;

	let originIndex = view.config.remotes.findIndex((remote: GG.GitRepoSettingsRemote) => remote.name === 'origin');
	let upstreamIndex = view.config.remotes.findIndex((remote: GG.GitRepoSettingsRemote) => remote.name === 'upstream');
	let sourceRemoteIndex = view.config.remotes.findIndex((remote: GG.GitRepoSettingsRemote) => remote.name === config.sourceRemote);
	let destRemoteIndex = view.config.remotes.findIndex((remote: GG.GitRepoSettingsRemote) => remote.name === config.destRemote);

	if (config.sourceRemote === '' || sourceRemoteIndex === -1) {
		sourceRemoteIndex = originIndex > -1 ? originIndex : 0;
	}
	if (config.destRemote === '') {
		destRemoteIndex = upstreamIndex > -1 ? upstreamIndex : originIndex > -1 ? originIndex : 0;
	}

	let defaultProvider = config.provider.toString();
	let providerOptions = [
		{ name: 'Bitbucket', value: (GG.PullRequestProvider.Bitbucket).toString() },
		{ name: 'GitHub', value: (GG.PullRequestProvider.GitHub).toString() },
		{ name: 'GitLab', value: (GG.PullRequestProvider.GitLab).toString() }
	];
	let providerTemplateLookup: { [name: string]: string } = {};
	initialState.config.customPullRequestProviders.forEach((provider) => {
		providerOptions.push({ name: provider.name, value: (providerOptions.length + 1).toString() });
		providerTemplateLookup[provider.name] = provider.templateUrl;
	});
	if (config.provider === GG.PullRequestProvider.Custom) {
		if (!providerOptions.some((provider) => provider.name === config.custom.name)) {
			providerOptions.push({ name: config.custom.name, value: (providerOptions.length + 1).toString() });
			providerTemplateLookup[config.custom.name] = config.custom.templateUrl;
		}
		defaultProvider = providerOptions.find((provider) => provider.name === config.custom.name)!.value;
	}
	providerOptions.sort((a, b) => a.name.localeCompare(b.name));

	let sourceRemoteOptions = view.config.remotes.map((remote: GG.GitRepoSettingsRemote, index: number) => ({ name: remote.name, value: index.toString() }));
	let destRemoteOptions = sourceRemoteOptions.map((option: { name: string; value: string }) => option);
	destRemoteOptions.push({ name: 'Not a remote', value: '-1' });

	dialog.showForm('Configure "Pull Request Creation" Integration (Step&nbsp;1/2)', [
		{ type: DialogInputType.Select, name: 'Provider', options: providerOptions, default: defaultProvider, info: 'In addition to the built-in publicly hosted Pull Request providers, custom providers can be configured using the Extension Setting "an-dr-commits.customPullRequestProviders" (e.g. for use with privately hosted Pull Request providers).' },
		{ type: DialogInputType.Select, name: 'Source Remote', options: sourceRemoteOptions, default: sourceRemoteIndex.toString(), info: 'The remote that corresponds to the source of the Pull Request.' },
		{ type: DialogInputType.Select, name: 'Destination Remote', options: destRemoteOptions, default: destRemoteIndex.toString(), info: 'The remote that corresponds to the destination / target of the Pull Request.' }
	], 'Next', (values) => {
		if (view.config === null) return;

		let newProvider = <GG.PullRequestProvider>parseInt(<string>values[0]);
		if (newProvider > 3) newProvider = GG.PullRequestProvider.Custom;

		const newSourceRemoteIndex = parseInt(<string>values[1]);
		const newDestRemoteIndex = parseInt(<string>values[2]);
		const newSourceRemote = view.config.remotes[newSourceRemoteIndex].name;
		const newDestRemote = newDestRemoteIndex > -1 ? view.config.remotes[newDestRemoteIndex].name : null;
		const newSourceUrl = view.config.remotes[newSourceRemoteIndex].url;
		const newDestUrl = newDestRemoteIndex > -1 ? view.config.remotes[newDestRemoteIndex].url : null;

		if (config.hostRootUrl === '' || config.provider !== newProvider) {
			const remoteUrlForHost = newSourceUrl !== null ? newSourceUrl : newDestUrl;
			if (remoteUrlForHost !== null) {
				const match = remoteUrlForHost.match(/^(https?:\/\/|git@)((?=[^/]+@)[^@]+@|(?![^/]+@))([^/:]+)/);
				config.hostRootUrl = match !== null ? 'https://' + match[3] : '';
			} else {
				config.hostRootUrl = '';
			}
		}

		if (newProvider === GG.PullRequestProvider.Custom) {
			const customProviderName = providerOptions.find((provider) => provider.value === <string>values[0])!.name;
			config.custom = { name: customProviderName, templateUrl: providerTemplateLookup[customProviderName] };
		} else {
			config.custom = null;
		}
		config.provider = newProvider;

		if (config.sourceRemote !== newSourceRemote) {
			config.sourceRemote = newSourceRemote;
			const match = newSourceUrl !== null ? newSourceUrl.match(/^(https?:\/\/|git@)[^/:]+[/:]([^/]+)\/([^/]*?)(.git|)$/) : null;
			config.sourceOwner = match !== null ? match[2] : '';
			config.sourceRepo = match !== null ? match[3] : '';
		}

		if (config.provider !== GG.PullRequestProvider.GitLab || config.destRemote !== newDestRemote) {
			config.destProjectId = '';
		}

		if (config.destRemote !== newDestRemote) {
			config.destRemote = newDestRemote;
			if (newDestRemote !== null) {
				const match = newDestUrl !== null ? newDestUrl.match(/^(https?:\/\/|git@)[^/:]+[/:]([^/]+)\/([^/]*?)(.git|)$/) : null;
				config.destOwner = match !== null ? match[2] : '';
				config.destRepo = match !== null ? match[3] : '';
				const branches = view.view.getBranches()
					.filter((branch: string) => branch.startsWith('remotes/' + newDestRemote + '/') && branch !== ('remotes/' + newDestRemote + '/HEAD'))
					.map((branch: string) => branch.substring(newDestRemote.length + 9));
				config.destBranch = branches.length > 0 ? (branches.includes('master') ? 'master' : branches[0]) : '';
			} else {
				config.destOwner = '';
				config.destRepo = '';
				config.destBranch = '';
			}
		}

		view.showCreatePullRequestIntegrationDialog2(config);
	}, { type: TargetType.Repo });
}

function settingsWidgetShowCreatePullRequestIntegrationDialog2(view: any, config: GG.DeepWriteable<GG.PullRequestConfig>) {
	if (view.config === null) return;

	const destBranches = config.destRemote !== null
		? view.view.getBranches()
			.filter((branch: string) => branch.startsWith('remotes/' + config.destRemote + '/') && branch !== ('remotes/' + config.destRemote + '/HEAD'))
			.map((branch: string) => branch.substring(config.destRemote!.length + 9))
		: [];
	const destBranchInfo = 'The name of the branch that is the destination / target of the Pull Request.';

	const updateConfigWithFormValues = (values: DialogInputValue[]) => {
		const hostRootUri = <string>values[0];
		config.hostRootUrl = hostRootUri.endsWith('/') ? hostRootUri.substring(0, hostRootUri.length - 1) : hostRootUri;
		config.sourceOwner = <string>values[1];
		config.sourceRepo = <string>values[2];
		config.destOwner = <string>values[3];
		config.destRepo = <string>values[4];
		config.destProjectId = config.provider === GG.PullRequestProvider.GitLab ? <string>values[5] : '';
		const destBranch = <string>values[config.provider === GG.PullRequestProvider.GitLab ? 6 : 5];
		config.destBranch = config.destRemote === null || destBranches.length === 0 ? destBranch : destBranches[parseInt(destBranch)];
	};

	const inputs: DialogInput[] = [
		{ type: DialogInputType.Text, name: 'Host Root URL', default: config.hostRootUrl, placeholder: null, info: 'The Pull Request provider\'s Host Root URL (e.g. https://github.com).' },
		{ type: DialogInputType.Text, name: 'Source Owner', default: config.sourceOwner, placeholder: null, info: 'The owner of the repository that is the source of the Pull Request.' },
		{ type: DialogInputType.Text, name: 'Source Repo', default: config.sourceRepo, placeholder: null, info: 'The name of the repository that is the source of the Pull Request.' },
		{ type: DialogInputType.Text, name: 'Destination Owner', default: config.destOwner, placeholder: null, info: 'The owner of the repository that is the destination / target of the Pull Request.' },
		{ type: DialogInputType.Text, name: 'Destination Repo', default: config.destRepo, placeholder: null, info: 'The name of the repository that is the destination / target of the Pull Request.' }
	];
	if (config.provider === GG.PullRequestProvider.GitLab) {
		inputs.push({ type: DialogInputType.Text, name: 'Destination Project ID', default: config.destProjectId, placeholder: null, info: 'The GitLab Project ID of the destination / target of the Pull Request. Leave this field blank to use the default destination / target configured in GitLab.' });
	}
	inputs.push(config.destRemote === null || destBranches.length === 0
		? { type: DialogInputType.Text, name: 'Destination Branch', default: config.destBranch, placeholder: null, info: destBranchInfo }
		: { type: DialogInputType.Select, name: 'Destination Branch', options: destBranches.map((branch: string, index: number) => ({ name: branch, value: index.toString() })), default: destBranches.includes(config.destBranch) ? destBranches.indexOf(config.destBranch).toString() : '0', info: destBranchInfo });

	dialog.showForm('Configure "Pull Request Creation" Integration (Step&nbsp;2/2)', inputs, 'Save Configuration', (values) => {
		updateConfigWithFormValues(values);
		view.setPullRequestConfig(config);
	}, { type: TargetType.Repo }, 'Back', (values) => {
		updateConfigWithFormValues(values);
		view.showCreatePullRequestIntegrationDialog1(config);
	});
}
