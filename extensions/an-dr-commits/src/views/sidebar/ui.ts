export function codicon(name: string, extraClass: string = '') {
	return '<span class="codicon codicon-' + name + (extraClass === '' ? '' : ' ' + extraClass) + '" aria-hidden="true"></span>';
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
