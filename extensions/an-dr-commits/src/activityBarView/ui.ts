import * as path from 'path';

export function esc(str: string) {
	const escapes: { [key: string]: string } = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#x27;', '/': '&#x2F;' };
	return str.replace(/[&<>"'\/]/g, (ch) => escapes[ch]);
}

export function codicon(name: string, extraClass: string = '') {
	return '<span class="codicon codicon-' + name + (extraClass === '' ? '' : ' ' + extraClass) + '" aria-hidden="true"></span>';
}

/**
 * Renders the Activity Bar repository selector using the same dropdown class
 * contract as the main Commits toolbar.
 */
export function renderRepoSelector(currentRepo: string | null, repoPaths: string[]): string {
	if (repoPaths.length === 0) {
		return `<div id="activityRepo">No Git repository</div>`;
	}
	// Always render the same dropdown widget as the multi-repo case - matching the tab's
	// Dropdown class, which stays fully rendered (and clickable/openable) with a single
	// option, rather than swapping to a visually different plain element.
	const selectedName = currentRepo !== null ? esc(path.basename(currentRepo)) : '';
	const optionsHtml = repoPaths.map((p, i) => {
		const name = esc(path.basename(p));
		const isSel = p === currentRepo;
		return `<div class="dropdownOption${isSel ? ' selected' : ''}" data-id="${i}" data-value="${esc(p)}" title="${name}">` +
			`${name}` +
			`<div class="dropdownOptionInfo" title="${esc(p)}">${codicon('info')}</div>` +
			`</div>`;
	}).join('');
	return `<div id="activityRepoDropdown" class="dropdown loaded">` +
		`<div class="dropdownCurrentValue" title="${selectedName}">${selectedName}</div>` +
		`<div class="dropdownMenu">` +
		`<div class="dropdownFilter"><input class="dropdownFilterInput" placeholder="Filter Repos..." style="display:none"></div>` +
		`<div class="dropdownOptions showInfo">${optionsHtml}</div>` +
		`<div class="dropdownNoResults" style="display:none">No results found.</div>` +
		`</div>` +
		`</div>`;
}

export function renderRefreshButton() {
	return `<button id="activityRefresh" class="activityIconBtn" title="Refresh">${codicon('sync')}</button>`;
}

/**
 * Renders a tag reference using the same gitRef/tag/compact class contract as
 * the main commit table. The color variable is supplied by the graph row.
 */
export function renderTagPill(name: string, compact: boolean = false, title?: string) {
	const fullTitle = title ?? 'Tag: ' + name;
	return `<span class="gitRef tag${compact ? ' compact' : ''}" title="${esc(fullTitle)}" data-name="${esc(name)}" data-drag-ref-type="tag" data-drag-ref-name="${esc(name)}">` +
		codicon('tag') +
		`<span class="gitRefName" data-fullref="${esc(name)}">${esc(name)}</span>` +
		`</span>`;
}

export function renderTagOverflowPill(count: number, title: string) {
	const label = '+' + count;
	return `<span class="gitRef tag compact miniTagMore" title="${esc(title)}" data-name="${label}">` +
		`<span class="gitRefName" data-fullref="${label}">${label}</span>` +
		`</span>`;
}
