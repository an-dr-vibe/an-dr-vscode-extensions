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

	let cdvAvatarsElems = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('cdvSummaryAvatar');
	for (let i = 0; i < cdvAvatarsElems.length; i++) {
		if (cdvAvatarsElems[i].dataset.email === escapedEmail) {
			delete cdvAvatarsElems[i].dataset.procedural;
			cdvAvatarsElems[i].innerHTML = '<img class="avatarImg" src="' + image + '">';
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

function commitsUpdateCommittedColumnDisplayMode(view: any) {
	view.tableElem.classList.remove('committedHideTime');
	if (view.config.dateFormat.type !== GG.DateFormatType.DateAndTime || !view.getColumnVisibility().committed) return;
	const committedCells = <NodeListOf<HTMLElement>>view.tableElem.querySelectorAll('tr.commit td.committedCol');
	for (let i = 0; i < committedCells.length; i++) {
		const cell = committedCells[i];
		const meta = <HTMLElement | null>cell.querySelector('.committedMeta');
		if (meta === null) continue;
		const avatar = <HTMLElement | null>cell.querySelector('.avatar');
		const avatarWidth = avatar !== null ? avatar.offsetWidth + 4 : 0;
		const style = window.getComputedStyle(cell);
		const paddingLeft = parseFloat(style.paddingLeft) || 0;
		const paddingRight = parseFloat(style.paddingRight) || 0;
		const availableWidth = cell.clientWidth - paddingLeft - paddingRight - avatarWidth;
		if (availableWidth <= 0 || meta.scrollWidth > availableWidth + 1) {
			view.tableElem.classList.add('committedHideTime');
			return;
		}
	}
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
	return '<span class="cdvSummaryAvatar ' + shapeClass + '"' + attributes + '><img class="avatarImg" src="' + visual.image + '"></span>';
}
