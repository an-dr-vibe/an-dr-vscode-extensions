/* Miscellaneous Helper Methods */

function haveFilesChanged(oldFiles: ReadonlyArray<GG.GitFileChange> | null, newFiles: ReadonlyArray<GG.GitFileChange> | null) {
	if ((oldFiles === null) !== (newFiles === null)) {
		return true;
	} else if (oldFiles === null && newFiles === null) {
		return false;
	} else {
		return !arraysEqual(oldFiles!, newFiles!, (a, b) => a.additions === b.additions && a.deletions === b.deletions && a.newFilePath === b.newFilePath && a.oldFilePath === b.oldFilePath && a.type === b.type);
	}
}

function abbrevCommit(commitHash: string) {
	return commitHash.substring(0, 8);
}

function resolveAmbiguousRepoNames(distinctNames: string[], paths: string[], firstSep: number[], indexes: number[]) {
	let firstOccurrence: { [name: string]: number } = {}, ambiguous: { [name: string]: number[] } = {};
	for (let i = 0; i < indexes.length; i++) {
		let name = distinctNames[indexes[i]];
		if (typeof firstOccurrence[name] === 'number') {
			if (typeof ambiguous[name] === 'undefined') ambiguous[name] = [firstOccurrence[name]];
			ambiguous[name].push(indexes[i]);
		} else {
			firstOccurrence[name] = indexes[i];
		}
	}
	let ambiguousNames = Object.keys(ambiguous);
	for (let i = 0; i < ambiguousNames.length; i++) {
		let ambiguousIndexes = ambiguous[ambiguousNames[i]], retestIndexes = [];
		for (let j = 0; j < ambiguousIndexes.length; j++) {
			let ambiguousIndex = ambiguousIndexes[j];
			let nextSep = paths[ambiguousIndex].lastIndexOf('/', paths[ambiguousIndex].length - distinctNames[ambiguousIndex].length - 2);
			if (firstSep[ambiguousIndex] < nextSep) {
				distinctNames[ambiguousIndex] = paths[ambiguousIndex].substring(nextSep + 1);
				retestIndexes.push(ambiguousIndex);
			} else {
				distinctNames[ambiguousIndex] = paths[ambiguousIndex];
			}
		}
		if (retestIndexes.length > 1) resolveAmbiguousRepoNames(distinctNames, paths, firstSep, retestIndexes);
	}
}

function getRepoDropdownOptions(repos: Readonly<GG.GitRepoSet>) {
	const repoPaths = getSortedRepositoryPaths(repos, initialState.config.repoDropdownOrder);
	const paths: string[] = [], names: string[] = [], distinctNames: string[] = [], firstSep: number[] = [];
	const indexes = [];
	for (let i = 0; i < repoPaths.length; i++) {
		firstSep.push(repoPaths[i].indexOf('/'));
		const repo = repos[repoPaths[i]];
		if (repo.name) {
			paths.push(repoPaths[i]);
			names.push(repo.name);
			distinctNames.push(repo.name);
		} else if (firstSep[i] === repoPaths[i].length - 1 || firstSep[i] === -1) {
			paths.push(repoPaths[i]);
			names.push(repoPaths[i]);
			distinctNames.push(repoPaths[i]);
		} else {
			paths.push(repoPaths[i].endsWith('/') ? repoPaths[i].substring(0, repoPaths[i].length - 1) : repoPaths[i]);
			let name = paths[i].substring(paths[i].lastIndexOf('/') + 1);
			names.push(name);
			distinctNames.push(name);
			indexes.push(i);
		}
	}
	resolveAmbiguousRepoNames(distinctNames, paths, firstSep, indexes);
	const options: DropdownOption[] = [];
	for (let i = 0; i < repoPaths.length; i++) {
		let hint;
		if (names[i] === distinctNames[i]) {
			hint = '';
		} else {
			let hintPath = distinctNames[i].substring(0, distinctNames[i].length - names[i].length - 1);
			let hintComps = hintPath.split('/');
			let keepDirs = hintComps[0] !== '' ? 2 : 3;
			if (hintComps.length > keepDirs) hintComps.splice(keepDirs, hintComps.length - keepDirs, '...');
			hint = (distinctNames[i] !== paths[i] ? '.../' : '') + hintComps.join('/');
		}
		options.push({ name: names[i], value: repoPaths[i], hint: hint });
	}
	return options;
}

function runAction(msg: GG.RequestMessage, action: string) {
	dialog.showActionRunning(action);
	sendMessage(msg);
}

function getBranchLabels(heads: ReadonlyArray<string>, remotes: ReadonlyArray<GG.GitCommitRemote>, remoteHeadTargets: { readonly [remoteName: string]: string } = {}) {
	let headLabels: { name: string; remotes: string[] }[] = [], headLookup: { [name: string]: number } = {}, remoteLabels: ReadonlyArray<GG.GitCommitRemote>;
	for (let i = 0; i < heads.length; i++) {
		headLabels.push({ name: heads[i], remotes: [] });
		headLookup[heads[i]] = i;
	}
	const filteredRemotes: GG.GitCommitRemote[] = [];
	for (let i = 0; i < remotes.length; i++) {
		const remote = remotes[i];
		if (remote.remote !== null && remote.name === remote.remote + '/HEAD') {
			const remoteHeadTarget = remoteHeadTargets[remote.remote];
			if (typeof remoteHeadTarget === 'string' && remoteHeadTarget !== '') {
				continue;
			}
		}
		filteredRemotes.push(remote);
	}
	if (initialState.config.referenceLabels.combineLocalAndRemoteBranchLabels) {
		let remainingRemoteLabels: GG.GitCommitRemote[] = [];
		for (let i = 0; i < filteredRemotes.length; i++) {
			const remote = filteredRemotes[i];
			if (remote.remote !== null) {
				let branchName = remote.name.substring(remote.remote.length + 1);
				if (typeof headLookup[branchName] === 'number') {
					headLabels[headLookup[branchName]].remotes.push(remote.remote);
					continue;
				}
			}
			remainingRemoteLabels.push(remote);
		}
		remoteLabels = remainingRemoteLabels;
	} else {
		remoteLabels = filteredRemotes;
	}
	return { heads: headLabels, remotes: remoteLabels };
}

function findCommitElemWithId(elems: HTMLCollectionOf<HTMLElement>, id: number | null) {
	if (id === null) return null;
	let findIdStr = id.toString();
	for (let i = 0; i < elems.length; i++) {
		if (findIdStr === elems[i].dataset.id) return elems[i];
	}
	return null;
}

function generateSignatureHtml(signature: GG.GitSignature) {
	return '<span class="signatureInfo ' + signature.status + '" title="' + GIT_SIGNATURE_STATUS_DESCRIPTIONS[signature.status] + ':'
		+ ' Signed by ' + escapeHtml(signature.signer !== '' ? signature.signer : '<Unknown>')
		+ ' (GPG Key Id: ' + escapeHtml(signature.key !== '' ? signature.key : '<Unknown>') + ')">'
		+ (signature.status === GG.GitSignatureStatus.GoodAndValid
			? SVG_ICONS.passed
			: signature.status === GG.GitSignatureStatus.Bad
				? SVG_ICONS.failed
				: SVG_ICONS.inconclusive)
		+ '</span>';
}

function closeDialogAndContextMenu() {
	if (dialog.isOpen()) dialog.close();
	if (contextMenu.isOpen()) contextMenu.close();
}
