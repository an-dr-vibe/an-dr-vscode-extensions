/**
 * Small UI helpers shared by every webview bundle - currently pulled in by Dropdown
 * (web/common/dropdown.ts), which itself moved here so the sidebar's repo selector can reuse it
 * rather than reimplementing dropdown behavior a second time (see ADR-003). Global scope, no
 * imports/exports - same concatenated-script model as the rest of web/.
 */

const CLASS_SELECTED = 'selected';

/**
 * Alter an HTML Element such that it contains, or doesn't contain the specified class name.
 * @param elem The HTML Element to alter.
 * @param className The class name.
 * @param state TRUE => Ensure the HTML Element has the class name, FALSE => Ensure the HTML Element doesn't have the class name
 * @returns TRUE => The HTML Element was altered, FALSE => No change was required.
 */
function alterClass(elem: HTMLElement, className: string, state: boolean) {
	if (elem.classList.contains(className) !== state) {
		if (state) {
			elem.classList.add(className);
		} else {
			elem.classList.remove(className);
		}
		return true;
	}
	return false;
}

/**
 * Format an array of strings as a comma separated list.
 * @param items The array of strings.
 * @returns A formatted comma separated string (e.g. "A, B & C").
 */
function formatCommaSeparatedList(items: string[]) {
	let str = '';
	for (let i = 0; i < items.length; i++) {
		str += (i > 0 ? (i < items.length - 1 ? ', ' : ' & ') : '') + items[i];
	}
	return str;
}
