import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function loadFileIcons(): { [extOrName: string]: string } {
	const iconExt = vscode.extensions.getExtension('an-dr.an-dr-file-icons');
	if (!iconExt) { return {}; }
	const iconsDir = path.join(iconExt.extensionPath, 'fileicons', 'icons');

	function readSvg(filename: string): string {
		try {
			const raw = fs.readFileSync(path.join(iconsDir, filename), 'utf8').trim();
			return raw.replace('<svg ', '<svg width="16" height="16" ');
		} catch {
			return '';
		}
	}

	const EXT_MAP: Array<[string[], string]> = [
		[['ts', 'tsx', 'mts', 'cts'], 'typescript.svg'],
		[['js', 'jsx', 'mjs', 'cjs'], 'javascript.svg'],
		[['json', 'jsonc'], 'json.svg'],
		[['md', 'mdx'], 'markdown.svg'],
		[['css', 'scss', 'sass', 'less'], 'css.svg'],
		[['html', 'htm'], 'html.svg'],
		[['ps1', 'psm1', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd'], 'shell.svg'],
		[['yaml', 'yml'], 'yaml.svg'],
		[['svg'], 'svg-file.svg'],
		[['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff'], 'image.svg'],
		[['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'vsix'], 'archive.svg'],
		[['txt', 'log'], 'text.svg'],
	];

	const NAME_MAP: Array<[string, string]> = [
		['.gitignore', 'git.svg'],
		['.gitattributes', 'git.svg'],
		['.gitmodules', 'git.svg'],
		['package.json', 'package-file.svg'],
		['package-lock.json', 'lock.svg'],
		['yarn.lock', 'lock.svg'],
		['pnpm-lock.yaml', 'lock.svg'],
		['tsconfig.json', 'config.svg'],
		['jsconfig.json', 'config.svg'],
		['.eslintrc', 'config.svg'],
		['.eslintrc.json', 'config.svg'],
		['.prettierrc', 'config.svg'],
		['.editorconfig', 'config.svg'],
		['.env', 'config.svg'],
	];

	const result: { [key: string]: string } = {};
	result[''] = readSvg('file-default.svg');
	for (const [exts, file] of EXT_MAP) {
		const svg = readSvg(file);
		if (svg) { for (const ext of exts) { result[ext] = svg; } }
	}
	for (const [name, file] of NAME_MAP) {
		const svg = readSvg(file);
		if (svg) { result[name] = svg; }
	}
	return result;
}
