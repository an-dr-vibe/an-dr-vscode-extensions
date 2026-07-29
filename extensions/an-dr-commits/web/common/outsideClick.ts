/**
 * Shared "click landed inside my own root element(s), or outside" detection, used by Dropdown
 * and CustomSelect - both already use this exact `.closest()`-against-my-root technique to
 * decide whether a click should close them, differing only in how many root elements they
 * check and what they do with an inside click (which stays entirely caller-owned: Dropdown's
 * open/close toggle and option-click routing, CustomSelect's option/keyboard routing, are not
 * forced into one shape here). ContextMenu closes via a different mechanism entirely
 * (stopPropagation at the source, so its document-level listener never needs to distinguish
 * inside from outside) and isn't a fit for this helper. See ADR-003.
 */

/**
 * Registers a capture-phase document click listener and reports, for every click, whether it
 * landed inside the widget's own root element(s).
 * @param isInside Given the click target, whether it falls inside any of the widget's own root element(s).
 * @param onClick Called for every click with the event and whether it was inside.
 * @returns A function that removes the listener, for widgets that get torn down before the page unloads (e.g. CustomSelect.remove()).
 */
function addOutsideClickListener(isInside: (target: HTMLElement) => boolean, onClick: (e: MouseEvent, inside: boolean) => void): () => void {
	const listener = (e: MouseEvent) => {
		if (!e.target) return;
		onClick(e, isInside(<HTMLElement>e.target));
	};
	document.addEventListener('click', listener, true);
	return () => document.removeEventListener('click', listener, true);
}
