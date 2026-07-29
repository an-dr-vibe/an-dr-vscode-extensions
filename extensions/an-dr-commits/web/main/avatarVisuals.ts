function commitsLoadAvatar(view: any, email: string, image: string) {
	view.avatars[email] = image;
	view.saveState();
	if (!view.shouldFetchAuthorAvatars()) return;

	let avatarsElems = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('avatar'), escapedEmail = escapeHtml(email);
	for (let i = 0; i < avatarsElems.length; i++) {
		if (avatarsElems[i].dataset.email === escapedEmail) {
			avatarsElems[i].classList.remove('empty');
			delete avatarsElems[i].dataset.procedural;
			avatarsElems[i].innerHTML = '<img class="avatarImg" src="' + image + '">';
		}
	}

	let commitDetailsViewAvatarsElems = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('commitDetailsViewSummaryAvatar');
	for (let i = 0; i < commitDetailsViewAvatarsElems.length; i++) {
		if (commitDetailsViewAvatarsElems[i].dataset.email === escapedEmail) {
			delete commitDetailsViewAvatarsElems[i].dataset.procedural;
			commitDetailsViewAvatarsElems[i].innerHTML = '<img class="avatarImg" src="' + image + '">';
		}
	}

	if (view.expandedCommit !== null && view.expandedCommit.commitDetails !== null && view.expandedCommit.commitDetails.authorEmail === email) {
		view.expandedCommit.avatar = image;
		if (view.config.avatarMode === GG.AuthorAvatarMode.FetchedOnly) view.renderCommitDetailsView(true);
	}
}

function commitsShouldFetchAuthorAvatars(view: any) {
	return view.config.fetchAvatars && (view.config.avatarMode === GG.AuthorAvatarMode.Auto || view.config.avatarMode === GG.AuthorAvatarMode.FetchedOnly);
}

function commitsGetAuthorAvatarShapeClass(view: any) {
	return view.config.avatarShape === GG.AuthorAvatarShape.Square ? 'square' : 'circle';
}

function commitsGetAuthorAvatarSizeClass(view: any) {
	return view.config.avatarSize === GG.AuthorAvatarSize.Small ? 'small' : 'normal';
}

function commitsGetIdColStyleWidth(): number {
	// Measure the pixel width of 8 hex chars in the editor monospace font at the table font size.
	// th.style.width = td_content_needed - (th_padding - td_padding) = content - (24 - 8) = content - 16
	const probe = document.createElement('span');
	const editorFont = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';
	probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:13px;';
	probe.style.fontFamily = editorFont;
	probe.textContent = 'ffffffff';
	document.body.appendChild(probe);
	const contentW = Math.ceil(probe.getBoundingClientRect().width) + 6;  // +6px breathing room
	document.body.removeChild(probe);
	return contentW - 16;  // convert td content width → th style.width
}

function commitsMeasureCommittedColumnStateWidth(view: any, hideTime: boolean, hideDate: boolean) {
	const sample = <HTMLElement | null>view.tableElem.querySelector('td.committedCol');
	const header = <HTMLElement | null>view.tableElem.querySelector('th.committedCol');
	if (sample === null || header === null) return 40;

	const avatar = <HTMLElement | null>sample.querySelector('.avatar:not(.empty)');
	const meta = <HTMLElement | null>sample.querySelector('.committedMeta');
	const date = <HTMLElement | null>sample.querySelector('.committedDate');
	const time = <HTMLElement | null>sample.querySelector('.committedTime');
	const font = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';
	const fontSize = getComputedStyle(sample).fontSize || '13px';
	const measureText = (text: string) => {
		const probe = document.createElement('span');
		probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:' + fontSize + ';font-family:' + font + ';left:-10000px;top:-10000px;';
		probe.textContent = text;
		document.body.appendChild(probe);
		const width = Math.ceil(probe.getBoundingClientRect().width);
		document.body.removeChild(probe);
		return width;
	};

	let cellContentWidth = 0;
	if (avatar !== null) {
		const avatarStyle = getComputedStyle(avatar);
		cellContentWidth += Math.ceil(avatar.getBoundingClientRect().width)
			+ (parseFloat(avatarStyle.marginLeft) || 0)
			+ (parseFloat(avatarStyle.marginRight) || 0);
	}
	if (!hideDate && meta !== null && date !== null) {
		cellContentWidth += measureText(date.textContent || '');
		if (!hideTime && time !== null) {
			const dateStyle = getComputedStyle(date);
			cellContentWidth += (parseFloat(dateStyle.marginRight) || 0) + measureText(time.textContent || '');
		}
	}

	const headerProbe = document.createElement('span');
	headerProbe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:13px;font-weight:700;left:-10000px;top:-10000px;';
	headerProbe.textContent = header.textContent || 'Dev';
	document.body.appendChild(headerProbe);
	const headerContentWidth = Math.ceil(headerProbe.getBoundingClientRect().width);
	document.body.removeChild(headerProbe);

	if (hideDate) return Math.max(headerContentWidth + COLUMN_LEFT_RIGHT_PADDING, 40);
	const cellWidthWithPadding = Math.ceil(cellContentWidth) + 16;
	return Math.max(cellWidthWithPadding, headerContentWidth + COLUMN_LEFT_RIGHT_PADDING, 40);
}

function commitsGetVisibleCommitTableWidth(view: any) {
	const tableRect = view.tableElem.getBoundingClientRect();
	const contentElem = view.tableElem.parentElement;
	const contentWidth = contentElem !== null ? contentElem.clientWidth : tableRect.width;
	const viewWidth = view.viewElem.clientWidth || tableRect.width;
	return Math.max(0, Math.floor(Math.min(tableRect.width, contentWidth, viewWidth)));
}

function commitsGetDescriptionTargetWidth(view: any, availableWidth: number, avatarWidth: number) {
	const maxPossible = Math.max(0, availableWidth - avatarWidth);
	return Math.max(120, Math.min(600, maxPossible));
}

function commitsUpdateCommittedColumnDisplayMode(view: any) {
	view.tableElem.classList.remove('committedHideTime');
	view.tableElem.classList.remove('committedHideDate');

	// Always enforce the correct fixed width for the ID column
	if (view.getColumnVisibility().id) {
		const idTh = <HTMLElement | null>view.tableElem.querySelector('th[data-col="3"]');
		if (idTh !== null) idTh.style.width = commitsGetIdColStyleWidth() + 'px';
	}

	if (!view.getColumnVisibility().committed) return;

	const devTh = <HTMLElement | null>view.tableElem.querySelector('th.committedCol');
	if (devTh === null) return;

	// Ensure fixedLayout so th.style.width is authoritative for the column
	if (!view.tableElem.classList.contains('fixedLayout')) {
		const cols = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('tableColHeader');
		for (let i = 0; i < cols.length; i++) {
			const col = parseInt(cols[i].dataset.col!);
			if (col === 0) {
				cols[i].style.width = (cols[i].clientWidth - COLUMN_LEFT_RIGHT_PADDING) + 'px';
			}
		}
		view.tableElem.classList.remove('autoLayout');
		view.tableElem.classList.add('fixedLayout');
	}

	const tableWidth = commitsGetVisibleCommitTableWidth(view);
	if (tableWidth === 0) return;

	const graphTh = <HTMLElement | null>view.tableElem.querySelector('th[data-col="0"]');
	const idTh = view.getColumnVisibility().id
		? <HTMLElement | null>view.tableElem.querySelector('th[data-col="3"]')
		: null;
	const graphWidth = graphTh ? graphTh.clientWidth : 50;
	const idWidth = idTh ? idTh.clientWidth : 0;
	const available = tableWidth - graphWidth - idWidth;

	const fullWidth = commitsMeasureCommittedColumnStateWidth(view, false, false);
	const dateWidth = commitsMeasureCommittedColumnStateWidth(view, true, false);
	const avatarWidth = commitsMeasureCommittedColumnStateWidth(view, true, true);
	const descriptionTargetWidth = commitsGetDescriptionTargetWidth(view, available, avatarWidth);
	let devVisW = fullWidth;
	let hideTime = false;
	let hideDate = false;

	if (available - fullWidth < descriptionTargetWidth) {
		devVisW = dateWidth;
		hideTime = true;
	}
	if (available - dateWidth < descriptionTargetWidth) {
		devVisW = avatarWidth;
		hideDate = true;
	}

	view.tableElem.classList.toggle('committedHideTime', hideTime);
	view.tableElem.classList.toggle('committedHideDate', hideDate);
	devTh.style.width = (devVisW - COLUMN_LEFT_RIGHT_PADDING) + 'px';
}

function commitsGetAuthorAvatarSeed(_view: any, author: string, email: string) {
	const normalizedEmail = email.trim().toLowerCase();
	if (normalizedEmail !== '') return 'email:' + normalizedEmail;
	const normalizedAuthor = author.trim().toLowerCase();
	return normalizedAuthor !== '' ? 'author:' + normalizedAuthor : 'author:unknown';
}

function commitsGetProceduralAvatarImage(view: any, seed: string) {
	if (typeof view.proceduralAvatars[seed] === 'string') return view.proceduralAvatars[seed];
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	let state = (hash >>> 0) || 1;
	const next = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
	const size = 40, grid = 5, cellSize = 8, radius = 1;
	const hue = Math.floor(next() * 360);
	const background = 'hsl(' + hue + ', 38%, 20%)';
	const colours = ['hsl(' + ((hue + 24) % 360) + ', 68%, 58%)', 'hsl(' + ((hue + 160) % 360) + ', 68%, 55%)', 'hsl(' + ((hue + 290) % 360) + ', 64%, 61%)'];
	let cells = '';
	for (let y = 0; y < grid; y++) {
		for (let x = 0; x < Math.ceil(grid / 2); x++) {
			if (next() >= 0.42) {
				const fill = colours[Math.floor(next() * colours.length)];
				const leftX = x * cellSize, rightX = (grid - 1 - x) * cellSize, topY = y * cellSize;
				cells += '<rect x="' + leftX + '" y="' + topY + '" width="' + cellSize + '" height="' + cellSize + '" rx="' + radius + '" ry="' + radius + '" fill="' + fill + '" />';
				if (rightX !== leftX) cells += '<rect x="' + rightX + '" y="' + topY + '" width="' + cellSize + '" height="' + cellSize + '" rx="' + radius + '" ry="' + radius + '" fill="' + fill + '" />';
			}
		}
	}
	if (next() > 0.5) {
		const stripe = colours[Math.floor(next() * colours.length)];
		cells += '<path d="M0 0 L' + size + ' 0 L0 ' + size + ' Z" fill="' + stripe + '" opacity="0.18" />';
	}
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '"><rect x="0" y="0" width="' + size + '" height="' + size + '" fill="' + background + '" />' + cells + '</svg>';
	const image = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
	view.proceduralAvatars[seed] = image;
	return image;
}

function commitsGetAuthorVisual(view: any, author: string, email: string, fetchedAvatar: string | null) {
	const mode = view.config.avatarMode;
	if (mode === GG.AuthorAvatarMode.Disabled) return { image: <string | null>null, procedural: false, updateOnFetch: false };
	const canFetchByEmail = email !== '' && view.shouldFetchAuthorAvatars();
	const cachedFetchedAvatar = fetchedAvatar !== null ? fetchedAvatar : (typeof view.avatars[email] === 'string' ? view.avatars[email] : null);
	if (mode === GG.AuthorAvatarMode.ProceduralPattern) {
		return { image: view.getProceduralAvatarImage(view.getAuthorAvatarSeed(author, email)), procedural: true, updateOnFetch: false };
	}
	if (mode === GG.AuthorAvatarMode.FetchedOnly) {
		return { image: canFetchByEmail ? cachedFetchedAvatar : null, procedural: false, updateOnFetch: canFetchByEmail };
	}
	if (cachedFetchedAvatar !== null) {
		return { image: cachedFetchedAvatar, procedural: false, updateOnFetch: canFetchByEmail };
	}
	return { image: view.getProceduralAvatarImage(view.getAuthorAvatarSeed(author, email)), procedural: true, updateOnFetch: canFetchByEmail };
}

function commitsGetCommitAuthorAvatarHtml(view: any, author: string, email: string) {
	const visual = view.getAuthorVisual(author, email, null);
	const shapeClass = view.getAuthorAvatarShapeClass();
	const sizeClass = view.getAuthorAvatarSizeClass();
	if (visual.image === null) {
		return visual.updateOnFetch ? '<span class="avatar ' + shapeClass + ' ' + sizeClass + ' empty" data-email="' + escapeHtml(email) + '"></span>' : '';
	}
	let attributes = '';
	if (visual.updateOnFetch) attributes += ' data-email="' + escapeHtml(email) + '"';
	if (visual.procedural) attributes += ' data-procedural="true"';
	return '<span class="avatar ' + shapeClass + ' ' + sizeClass + '"' + attributes + '><img class="avatarImg" src="' + visual.image + '"></span>';
}

function commitsGetCommittedVisualHtml(view: any, author: string, email: string) {
	if (view.config.committedVisual === GG.CommittedVisualMode.Initials) {
		const shapeClass = view.getAuthorAvatarShapeClass();
		const sizeClass = view.getAuthorAvatarSizeClass();
		const initials = getCommittedAuthorInitials(author, email);
		const bg = getCommittedInitialsBackgroundColor(view.getAuthorAvatarSeed(author, email));
		return '<span class="avatar initials ' + shapeClass + ' ' + sizeClass + '" style="background-color:' + bg + ';" title="' + escapeHtml(author) + '">' + escapeHtml(initials) + '</span>';
	}
	return view.getCommitAuthorAvatarHtml(author, email);
}

function commitsGetCommittedDateParts(view: any, formatted: string) {
	if (view.config.dateFormat.type !== GG.DateFormatType.DateAndTime) return { date: formatted, time: <string | null>null };
	const lastSpaceIndex = formatted.lastIndexOf(' ');
	if (lastSpaceIndex <= 0 || lastSpaceIndex >= formatted.length - 1) return { date: formatted, time: <string | null>null };
	return { date: formatted.substring(0, lastSpaceIndex), time: formatted.substring(lastSpaceIndex + 1) };
}

function commitsGetCommittedCellHtml(view: any, commit: GG.GitCommit) {
	const date = formatShortDate(commit.date);
	const dateParts = view.getCommittedDateParts(date.formatted);
	const authorDisplay = commit.author.trim() !== '' ? commit.author : (commit.email.trim() !== '' ? commit.email : 'Unknown Author');
	const title = escapeHtml(authorDisplay) + ' • ' + escapeHtml(date.title);
	return '<td class="committedCol text" title="' + title + '">' + view.getCommittedVisualHtml(commit.author, commit.email) + '<span class="committedMeta"><span class="committedDate">' + escapeHtml(dateParts.date) + '</span>' + (dateParts.time !== null ? '<span class="committedTime">' + escapeHtml(dateParts.time) + '</span>' : '') + '</span></td>';
}

function commitsGetCommitDetailsAvatarHtml(view: any, author: string, email: string, fetchedAvatar: string | null) {
	const visual = view.getAuthorVisual(author, email, fetchedAvatar);
	if (visual.image === null) return '';
	const shapeClass = view.getAuthorAvatarShapeClass();
	let attributes = '';
	if (visual.updateOnFetch) attributes += ' data-email="' + escapeHtml(email) + '"';
	if (visual.procedural) attributes += ' data-procedural="true"';
	return '<span class="commitDetailsViewSummaryAvatar ' + shapeClass + '"' + attributes + '><img class="avatarImg" src="' + visual.image + '"></span>';
}
