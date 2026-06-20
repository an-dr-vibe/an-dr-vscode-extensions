/** Pure helper functions for D3Renderer — no DOM/D3 dependency so they are unit-testable. */

export const LEVEL_COLORS = [
    { bg: '#E05565', border: '#B83040', label: '#fff' },
    { bg: '#E8A838', border: '#C07828', label: '#fff' },
    { bg: '#2FB8A0', border: '#1A8870', label: '#fff' },
    { bg: '#28AACC', border: '#1880A0', label: '#fff' },
    { bg: '#5B6AC4', border: '#3A48A0', label: '#fff' },
    { bg: '#8B5CF6', border: '#6D35CC', label: '#fff' },
];

export const EXTERNAL_COL = {
    bg: 'var(--vscode-disabledForeground,#888)',
    border: 'var(--vscode-panel-border,#555)',
    label: 'var(--vscode-editor-foreground,#ccc)',
};

/** Approximate pixel width of a node from its display label. */
export function estW(label: string): number {
    return Math.min((label ?? '').length * 7 + 28, 160);
}

/**
 * Clip a line endpoint to the rectangular boundary of the target node.
 * Returns the point on the rectangle perimeter where the line from (sx,sy)
 * toward (tx,ty) first enters the rectangle centred at (tx,ty).
 * If source equals target, returns target unchanged.
 * If hw is zero and the motion is purely vertical, returns (tx, ty) — the
 * degenerate rect has no left/right face to clip against.
 */
export function clipToRect(
    sx: number, sy: number,
    tx: number, ty: number,
    hw: number, hh: number,
): { x: number; y: number } {
    const dx = tx - sx, dy = ty - sy;
    if (dx === 0 && dy === 0) { return { x: tx, y: ty }; }
    const adx = Math.abs(dx), ady = Math.abs(dy);
    // Source already inside target rect → return target centre to avoid inverted arrow.
    if (adx <= hw && ady <= hh) { return { x: tx, y: ty }; }
    // Guard against division by zero when adx=0 (purely vertical motion).
    if (adx === 0) { return { x: tx, y: ty - hh * Math.sign(dy) }; }
    return hw * ady <= hh * adx
        ? { x: tx - hw * Math.sign(dx), y: ty - dy * hw / adx }
        : { x: tx - dx * hh / ady,      y: ty - hh * Math.sign(dy) };
}

/** Return the fill/stroke/label colours for a node given its BFS level and role. */
export function levelCol(level: number, role: string): { bg: string; border: string; label: string } {
    if (role === 'folder') { return EXTERNAL_COL; }
    // Floor + clamp level to valid integer index; guards negative, float, NaN, Infinity.
    const idx = Number.isFinite(level)
        ? Math.max(0, Math.min(Math.floor(level), LEVEL_COLORS.length - 1))
        : LEVEL_COLORS.length - 1;
    return LEVEL_COLORS[idx];
}
