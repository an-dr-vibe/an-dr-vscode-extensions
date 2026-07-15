interface CommitsHighlightJsApi {
	getLanguage: (name: string) => unknown;
	highlight: (code: string, options: { language: string; ignoreIllegals: boolean }) => { value: string };
}

declare const hljs: CommitsHighlightJsApi;

const COMMITS_HIGHLIGHT_LANGUAGE_BY_EXTENSION: { [extension: string]: string } = {
	asm: 'x86asm', bash: 'bash', bat: 'dos', c: 'c', cc: 'cpp', cjs: 'javascript',
	clj: 'clojure', cljc: 'clojure', cljs: 'clojure', cmake: 'cmake', cmd: 'dos',
	coffee: 'coffeescript', cpp: 'cpp', cs: 'csharp', csh: 'bash', css: 'css',
	cts: 'typescript', dart: 'dart', diff: 'diff', dockerfile: 'dockerfile', edn: 'clojure',
	eex: 'elixir', erl: 'erlang', ex: 'elixir', exs: 'elixir', fs: 'fsharp', fsi: 'fsharp',
	fsx: 'fsharp', gql: 'graphql', go: 'go', gradle: 'groovy', graphql: 'graphql',
	groovy: 'groovy', h: 'c', handlebars: 'handlebars', hbs: 'handlebars', hpp: 'cpp',
	hrl: 'erlang', hs: 'haskell', htm: 'xml', html: 'xml', ini: 'ini', java: 'java',
	jl: 'julia', js: 'javascript', json: 'json', jsonc: 'json', jsx: 'javascript', kt: 'kotlin',
	kts: 'kotlin', less: 'less', lhs: 'haskell', lua: 'lua', m: 'objectivec',
	makefile: 'makefile', markdown: 'markdown', mat: 'matlab', md: 'markdown', ml: 'ocaml', mli: 'ocaml', mm: 'objectivec',
	mjs: 'javascript', mts: 'typescript', php: 'php', pl: 'perl', pm: 'perl',
	powershell: 'powershell', proto: 'protobuf', ps1: 'powershell', psd1: 'powershell',
	psm1: 'powershell', py: 'python', pyw: 'python', r: 'r', rb: 'ruby',
	re: 'reasonml', rei: 'reasonml', rs: 'rust', s: 'x86asm', scala: 'scala', scss: 'scss', sh: 'bash', sql: 'sql',
	svelte: 'xml', swift: 'swift', toml: 'ini', ts: 'typescript', tsx: 'typescript',
	vb: 'vbnet', vim: 'vim', vue: 'xml', wasm: 'wasm', wat: 'wasm', xhtml: 'xml', xml: 'xml',
	yaml: 'yaml', yml: 'yaml', zsh: 'bash'
};

const COMMITS_HIGHLIGHT_LANGUAGE_BY_FILENAME: { [filename: string]: string } = {
	'.bash_profile': 'bash', '.bashrc': 'bash', '.env': 'bash', '.zprofile': 'bash',
	'.zshrc': 'bash', 'cmakelists.txt': 'cmake', 'dockerfile': 'dockerfile',
	'gemfile': 'ruby', 'jenkinsfile': 'groovy', 'makefile': 'makefile',
	'procfile': 'bash', 'rakefile': 'ruby'
};

/** Highlights a complete source file, then returns balanced markup for each display line. */
function commitsGetSyntaxHighlightedLines(content: string | null, filePath: string): string[] {
	const plainLines = commitsGetDisplayLines(content);
	if (content === null || plainLines.length === 0) return plainLines;
	const language = commitsGetHighlightLanguage(filePath);
	if (language === null || typeof hljs === 'undefined' || !hljs.getLanguage(language)) {
		return plainLines.map((line) => escapeHtml(line));
	}

	try {
		const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		const highlighted = hljs.highlight(normalized, { language: language, ignoreIllegals: true }).value;
		const lines = commitsSplitHighlightedHtml(highlighted);
		return lines.length >= plainLines.length ? lines.slice(0, plainLines.length) : plainLines.map((line) => escapeHtml(line));
	} catch (_err) {
		return plainLines.map((line) => escapeHtml(line));
	}
}

function commitsGetHighlightLanguage(filePath: string): string | null {
	const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
	const filename = normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1);
	if (COMMITS_HIGHLIGHT_LANGUAGE_BY_FILENAME[filename]) return COMMITS_HIGHLIGHT_LANGUAGE_BY_FILENAME[filename];
	if (filename.indexOf('dockerfile.') === 0) return 'dockerfile';
	const dot = filename.lastIndexOf('.');
	const extension = dot >= 0 ? filename.substring(dot + 1) : filename;
	return COMMITS_HIGHLIGHT_LANGUAGE_BY_EXTENSION[extension] || null;
}

function commitsSplitHighlightedHtml(highlightedHtml: string): string[] {
	const root = document.createElement('div');
	root.innerHTML = highlightedHtml;
	const lines = [''];

	const visit = (node: Node, classes: string[]) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const parts = (node.nodeValue || '').split('\n');
			for (let i = 0; i < parts.length; i++) {
				if (i > 0) lines.push('');
				if (parts[i] === '') continue;
				let html = escapeHtml(parts[i]);
				for (let j = classes.length - 1; j >= 0; j--) html = '<span class="' + classes[j] + '">' + html + '</span>';
				lines[lines.length - 1] += html;
			}
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const element = node as HTMLElement;
		const safeClasses = Array.from(element.classList).filter((name) => /^hljs-[a-z0-9_-]+$/i.test(name));
		Array.from(node.childNodes).forEach((child) => visit(child, classes.concat(safeClasses)));
	};

	Array.from(root.childNodes).forEach((child) => visit(child, []));
	return lines;
}
