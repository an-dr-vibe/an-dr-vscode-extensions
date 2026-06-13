import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_SKIP_DIRS = new Set([
    '.git', 'node_modules', 'build', 'out', 'dist',
    'subprojects', '.meson_build', '.cache', '.next', '.nuxt', 'coverage',
]);

export function collectFiles(
    dir: string,
    depth: number,
    maxDepth: number,
    extensions: Set<string>,
    results: string[],
    skipDirs = DEFAULT_SKIP_DIRS,
): void {
    if (depth >= maxDepth) { return; }
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
        if (e.name.startsWith('.') || skipDirs.has(e.name)) { continue; }
        const full = path.join(dir, e.name).replace(/\\/g, '/');
        if (e.isDirectory()) {
            collectFiles(full, depth + 1, maxDepth, extensions, results, skipDirs);
        } else if (e.isFile() && extensions.has(path.extname(e.name))) {
            results.push(full);
        }
    }
}
