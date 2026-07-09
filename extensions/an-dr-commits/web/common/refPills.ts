/**
 * Shared tag-ref-pill rendering (the `.gitRef.tag` markup contract) for every webview bundle
 * that shows tag pills - the tab's commit table and (from a later increment) the sidebar's
 * mini graph. See ADR-003. Global scope, no imports - same concatenated-script model as the
 * rest of web/.
 */

interface RenderTagPillOptions {
	/** Collapse to the icon-only compact form (used where space is tight, e.g. the sidebar's mini graph). */
	compact?: boolean;
	/** 'annotated' | 'lightweight' - included as data-tagtype only where the caller has it available. */
	tagType?: string;
	/** Whether the pill can be dragged onto a commit row (the tab's commit table supports this; the mini graph doesn't). */
	draggable?: boolean;
	/** Overrides the default 'Tag: <name>' tooltip. */
	title?: string;
}

/**
 * Render a single tag reference pill.
 * @param name The tag name (unescaped).
 * @param options Rendering variants - see {@link RenderTagPillOptions}.
 * @returns The pill HTML.
 */
function renderTagPill(name: string, options: RenderTagPillOptions = {}): string {
	const escapedName = escapeHtml(name);
	const title = escapeHtml(options.title ?? 'Tag: ' + name);
	const tagTypeAttr = options.tagType ? ' data-tagtype="' + options.tagType + '"' : '';
	const draggableAttr = options.draggable ? ' draggable="true"' : '';
	return '<span class="gitRef tag' + (options.compact ? ' compact' : '') + '" data-name="' + escapedName + '"' + tagTypeAttr +
		' data-drag-ref-type="tag" data-drag-ref-name="' + escapedName + '"' + draggableAttr + ' title="' + title + '">' +
		codicon('tag') + '<span class="gitRefName" data-fullref="' + escapedName + '">' + escapedName + '</span></span>';
}

/**
 * Render a compact "+N" overflow pill representing tags collapsed for lack of space.
 * @param count The number of additional tags represented.
 * @param title Tooltip listing the represented tag names.
 * @returns The pill HTML.
 */
function renderTagOverflowPill(count: number, title: string): string {
	const label = '+' + count;
	return '<span class="gitRef tag compact miniTagMore" title="' + escapeHtml(title) + '" data-name="' + label + '">' +
		'<span class="gitRefName" data-fullref="' + label + '">' + label + '</span></span>';
}
