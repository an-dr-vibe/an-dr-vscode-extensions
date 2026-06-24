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

/** Return the fill/stroke/label colours for a D3 node by BFS level and role. */
export function getLevelColors(level: number, role: string): { bg: string; border: string; label: string } {
    if (role === 'external' || role === 'folder') { return EXTERNAL_COL; }
    const idx = Number.isFinite(level)
        ? Math.max(0, Math.min(Math.floor(level), LEVEL_COLORS.length - 1))
        : LEVEL_COLORS.length - 1;
    return LEVEL_COLORS[idx];
}
