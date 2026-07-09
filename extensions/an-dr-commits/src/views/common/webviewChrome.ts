/**
 * Shared Node-side webview chrome: CSP/meta head markup and the full-panel loading splash used
 * by both the Commits tab and the Activity Bar sidebar. Both views build their own outer HTML
 * shell independently (they compile to separate webview bundles, see ADR-003), but the shell
 * boilerplate itself - CSP meta construction, the loading splash markup - was duplicated between
 * them; this module is the single source of truth for that boilerplate.
 */

/**
 * Standardise the CSP Source provided by Visual Studio Code for use with the Webview.
 */
export function standardiseCspSource(cspSource: string): string {
	if (cspSource.startsWith('http://') || cspSource.startsWith('https://')) {
		const pathIndex = cspSource.indexOf('/', 8), queryIndex = cspSource.indexOf('?', 8), fragmentIndex = cspSource.indexOf('#', 8);
		let endOfAuthorityIndex = pathIndex;
		if (queryIndex > -1 && (queryIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1)) endOfAuthorityIndex = queryIndex;
		if (fragmentIndex > -1 && (fragmentIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1)) endOfAuthorityIndex = fragmentIndex;
		return endOfAuthorityIndex > -1 ? cspSource.substring(0, endOfAuthorityIndex) : cspSource;
	} else {
		return cspSource;
	}
}

export interface WebviewChromeOptions {
	readonly cspSource: string;
	readonly nonce: string;
	/** Extra img-src value (e.g. 'data:') - omitted entirely (not just empty) when not given, since the tab and sidebar have always differed here and that difference is intentional, not an oversight to silently fix. */
	readonly imgSrc?: string;
}

/** Shared charset/CSP/viewport `<meta>` tags used by both webview shells' `<head>`. */
export function renderWebviewMetaTags(options: WebviewChromeOptions): string {
	const source = standardiseCspSource(options.cspSource);
	const imgSrc = options.imgSrc ? ` img-src ${options.imgSrc};` : '';
	return `<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${source} 'unsafe-inline'; font-src ${source}; script-src 'nonce-${options.nonce}';${imgSrc}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">`;
}

/**
 * Shared full-panel loading splash markup: a centered spinning codicon with a "Loading..."
 * label, shown while a full render is pending (first load / repo switch) and replaced once ready.
 * `idAttr` stays caller-supplied since each view's own stylesheet keys off its own id
 * (`#initialLoadSplash` for the tab, `#activityLoading` for the sidebar).
 */
export function renderLoadingSplashHtml(idAttr: string): string {
	return `<div id="${idAttr}"><span class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true"></span><span>Loading...</span></div>`;
}
