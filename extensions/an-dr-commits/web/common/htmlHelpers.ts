/**
 * HTML-escaping and codicon-rendering primitives shared by every webview bundle (tab and
 * sidebar) - see ADR-003. No imports/exports: web/tsconfig.json compiles the whole web/ tree
 * as one script bundle (module: "none"), same as every other file here, so these are plain
 * globals like everything else in web/.
 */

const HTML_ESCAPES: { [key: string]: string } = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#x27;', '/': '&#x2F;' };
const HTML_UNESCAPES: { [key: string]: string } = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': '\'', '&#x2F;': '/' };
const HTML_ESCAPER_REGEX = /[&<>"'\/]/g;
const HTML_UNESCAPER_REGEX = /&lt;|&gt;|&amp;|&quot;|&#x27;|&#x2F;/g;

/**
 * Escape HTML in the specified string.
 * @param str The string to escape.
 * @returns The escaped string.
 */
function escapeHtml(str: string) {
	return str.replace(HTML_ESCAPER_REGEX, (match) => HTML_ESCAPES[match]);
}

/**
 * Unescape HTML in the specified string.
 * @param str The string to unescape.
 * @returns The unescaped string.
 */
function unescapeHtml(str: string) {
	return str.replace(HTML_UNESCAPER_REGEX, (match) => HTML_UNESCAPES[match]);
}

/**
 * Render a codicon `<span>`.
 * @param name The codicon name (without the `codicon-` prefix).
 * @param extraClass Additional class names to append.
 * @returns The codicon HTML.
 */
function codicon(name: string, extraClass: string = '') {
	return '<span class="codicon codicon-' + name + (extraClass === '' ? '' : ' ' + extraClass) + '" aria-hidden="true"></span>';
}
