function commitsRenderFetchButton(view: any) {
	const hasRemotes = view.gitRemotes.length > 0;
	const hasRepoInProgressState = view.gitRepoInProgressState !== null;
	alterClass(view.controlsElem, 'pullPushSupported', !hasRepoInProgressState && hasRemotes && view.gitBranchHead !== null && view.gitBranchHead !== 'HEAD');
	alterClass(view.controlsElem, 'repoInProgressSupported', hasRepoInProgressState);
	alterClass(view.pullBtnElem, 'textAction', hasRepoInProgressState);
	alterClass(view.pushBtnElem, 'textAction', hasRepoInProgressState);
	if (hasRepoInProgressState) {
		view.pullBtnElem.textContent = 'Continue';
		view.pushBtnElem.textContent = 'Abort';
		view.pullBtnElem.title = view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Continue);
		view.pushBtnElem.title = view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Abort);
	} else {
		view.pullBtnElem.title = 'Pull Current Branch (Right-Click for More Actions)';
		view.pullBtnElem.innerHTML = SVG_ICONS.arrowDown;
		view.pushBtnElem.title = 'Push Current Branch (Right-Click for More Actions)';
		view.pushBtnElem.innerHTML = SVG_ICONS.arrowUp;
	}
	view.renderRepoInProgressBanner();
	view.updateControlsLayout();
}


function commitsRenderTagDetails(view: any, tagName: string, commitHash: string, details: GG.GitTagDetails) {
	const textFormatter = new TextFormatter(view.commits, view.gitRepos[view.currentRepo].issueLinkingConfig, {
		commits: true,
		emoji: true,
		issueLinking: true,
		markdown: view.config.markdown,
		multiline: true,
		urls: true
	});
	dialog.showMessage(
		'Tag <b><i>' + escapeHtml(tagName) + '</i></b><br><span class="messageContent">' +
		'<b>Object: </b>' + escapeHtml(details.hash) + '<br>' +
		'<b>Commit: </b>' + escapeHtml(commitHash) + '<br>' +
		'<b>Tagger: </b>' + escapeHtml(details.taggerName) + ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(details.taggerEmail) + '" tabindex="-1">' + escapeHtml(details.taggerEmail) + '</a>&gt;' + (details.signature !== null ? generateSignatureHtml(details.signature) : '') + '<br>' +
		'<b>Date: </b>' + formatLongDate(details.taggerDate) + '<br><br>' +
		textFormatter.format(details.message) +
		'</span>'
	);
}
