/**
 * Numeric helpers shared by every webview bundle. See ADR-003. Global scope, no
 * imports/exports - same concatenated-script model as the rest of web/.
 */

/**
 * Clamp a number to an inclusive range.
 * @param value The value to clamp.
 * @param min The minimum allowed value.
 * @param max The maximum allowed value.
 * @returns `value`, or the nearer bound if it falls outside `[min, max]`.
 */
function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}
