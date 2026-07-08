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
 * Icon-only Open Commits button - sits after the repo selector, in the slot the
 * refresh button used to occupy (refresh now leads the actions row instead). Text
 * moved to the title/hint since it no longer has room for a label next to icon buttons.
 */
export function renderOpenCommitsButton() {
	return `<button id="activityOpenCommits" class="activityIconBtn" title="Open Commits">${codicon('git-commit')}</button>`;
}

/**
 * Renders the Refresh/Reset/Fetch/Pull/Push/Force Push action row, using the same codicon
 * glyphs as the tab's toolbar (ICONS.discard/arrowDown/arrowUp in web/utils.ts) for
 * Reset/Pull/Push, plus a distinct icon for Fetch and a danger-tinted variant of the
 * push icon for Force Push so the two aren't visually identical. Refresh leads the row,
 * matching the tab's repoRefreshBtn moving to lead its own pull/push row.
 */
export function renderActionsRow(): string {
	return `<div id="activityActionsRow">` +
		renderRefreshButton() +
		`<button id="activityReset" class="activityIconBtn" title="Reset...">${codicon('discard')}</button>` +
		`<button id="activityFetch" class="activityIconBtn" title="Fetch">${codicon('cloud-download')}</button>` +
		`<button id="activityPull" class="activityIconBtn" title="Pull">${codicon('arrow-down')}</button>` +
		`<button id="activityPush" class="activityIconBtn" title="Push">${codicon('arrow-up')}</button>` +
		`<button id="activityForcePush" class="activityIconBtn danger" title="Force Push (with lease)...">${codicon('arrow-up')}</button>` +
		`</div>`;
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
