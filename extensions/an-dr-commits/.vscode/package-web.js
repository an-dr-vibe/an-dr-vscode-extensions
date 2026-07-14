const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const MEDIA_DIRECTORY = './media';
const STYLES_DIRECTORY = './web/styles';
const SIDEBAR_STYLES_DIRECTORY = './web/sidebar/styles';
const CODICONS_CSS_FILE = './node_modules/@vscode/codicons/dist/codicon.css';
const CODICONS_FONT_FILE = './node_modules/@vscode/codicons/dist/codicon.ttf';

const MAIN_CSS_FILE = 'main.css';
const MAIN_JS_FILE = 'main.js';
const UTILS_JS_FILE = 'utils.js';
const SIDEBAR_MAIN_JS_FILE = 'sidebar/main.js';
const CODICONS_FONT_OUTPUT_FILE = 'codicon.ttf';

const OUTPUT_MIN_CSS_FILE = 'out.min.css';
const OUTPUT_MIN_JS_FILE = 'out.min.js';
const OUTPUT_TMP_JS_FILE = 'out.tmp.js';
const SIDEBAR_OUTPUT_MIN_CSS_FILE = 'sidebar.min.css';
const SIDEBAR_OUTPUT_MIN_JS_FILE = 'sidebar.min.js';
const SIDEBAR_OUTPUT_TMP_JS_FILE = 'sidebar.tmp.js';

// web/common/ compiles alongside web/sidebar/ and the tab's own files; its output is shared by
// both bundles below. web/sidebar/ is exclusive to the sidebar bundle.
const COMMON_SCOPE_PREFIX = 'common/';
const SIDEBAR_SCOPE_PREFIX = 'sidebar/';

const RESERVED_OUTPUT_FILES = [OUTPUT_MIN_JS_FILE, OUTPUT_TMP_JS_FILE, SIDEBAR_OUTPUT_MIN_JS_FILE, SIDEBAR_OUTPUT_TMP_JS_FILE];

const DEBUG = process.argv.length > 2 && process.argv[2] === 'debug';

function collectFilesRecursive(dir, suffix) {
	const files = [];
	const stack = [dir];
	while (stack.length > 0) {
		const cur = stack.pop();
		fs.readdirSync(cur).forEach((entry) => {
			const full = path.join(cur, entry);
			if (fs.statSync(full).isDirectory()) {
				stack.push(full);
			} else if (entry.endsWith(suffix)) {
				files.push(full);
			}
		});
	}
	return files;
}

function relativeToMedia(filePath) {
	return path.relative(MEDIA_DIRECTORY, filePath).replace(/\\/g, '/');
}

// Gathered once so both bundles can be carved out of the same compiled tree without re-walking
// it per bundle, and so files shared by both (web/common/) are only read from disk, never
// deleted, until every bundle that needs them has already read them (see cleanup below).
const allCompiledJsFiles = collectFilesRecursive(MEDIA_DIRECTORY, '.js');

/**
 * Builds one JS bundle from a subset of the compiled tree, synchronously reading and
 * concatenating its inputs (so it's safe to call this for every bundle before deleting any
 * source file), then kicking off an async uglifyjs pass. Ordering matches the original
 * single-bundle contract: an optional pinned-first file, then an optional priority-prefixed
 * group (alphabetical), then everything else (alphabetical), then an optional pinned-last file.
 * Returns a Promise that resolves once minification finishes.
 */
function buildJsBundle({ label, include, priorityPrefix, firstFile, lastFile, tmpFile, outFile }) {
	const eligible = allCompiledJsFiles.filter((filePath) => {
		const relPath = relativeToMedia(filePath);
		if (RESERVED_OUTPUT_FILES.includes(relPath)) return false;
		if (firstFile && relPath === firstFile) return false;
		if (lastFile && relPath === lastFile) return false;
		return include(relPath);
	});
	const priority = priorityPrefix
		? eligible.filter((f) => relativeToMedia(f).startsWith(priorityPrefix)).sort((a, b) => a.localeCompare(b))
		: [];
	const rest = eligible
		.filter((f) => !priorityPrefix || !relativeToMedia(f).startsWith(priorityPrefix))
		.sort((a, b) => a.localeCompare(b));

	const orderedFiles = [];
	if (firstFile) orderedFiles.push(path.join(MEDIA_DIRECTORY, firstFile));
	orderedFiles.push(...priority, ...rest);
	if (lastFile) orderedFiles.push(path.join(MEDIA_DIRECTORY, lastFile));

	console.log('Packaging ' + label + ' JS files: ' + orderedFiles.join(', '));

	let jsFileContents = '';
	orderedFiles.forEach((fileName) => {
		jsFileContents += fs.readFileSync(fileName).toString().replace('"use strict";\r\n', '') + '\r\n';
	});
	fs.writeFileSync(path.join(MEDIA_DIRECTORY, tmpFile), '"use strict";\r\n(function(document, window){\r\n' + jsFileContents + '})(document, window);\r\n');

	return new Promise((resolve, reject) => {
		cp.exec('uglifyjs ' + path.join(MEDIA_DIRECTORY, tmpFile) + ' ' + (DEBUG ? '-b' : '--mangle') + ' --output ' + path.join(MEDIA_DIRECTORY, outFile), (err, stdout, stderr) => {
			if (err) {
				reject(err);
			} else if (stderr) {
				reject(new Error(stderr));
			} else {
				if (stdout !== '') console.log(stdout);
				fs.unlinkSync(path.join(MEDIA_DIRECTORY, tmpFile));
				resolve();
			}
		});
	});
}

/** Builds one CSS bundle from a styles directory (main.css pinned first, rest in readdir order). */
function buildCssBundle({ stylesDir, includeCodicons, outFile }) {
	let cssFileContents = includeCodicons
		? fs.readFileSync(CODICONS_CSS_FILE).toString().replace(/url\("\.\/codicon\.ttf[^"]*"\)/g, 'url("codicon.ttf")') + '\r\n'
		: '';

	let packageCssFiles = [path.join(stylesDir, MAIN_CSS_FILE)];
	fs.readdirSync(stylesDir).forEach((fileName) => {
		if (fileName.endsWith('.css') && fileName !== MAIN_CSS_FILE) {
			packageCssFiles.push(path.join(stylesDir, fileName));
		}
	});
	console.log('Packaging ' + outFile + ' CSS files: ' + packageCssFiles.join(', '));

	packageCssFiles.forEach((fileName) => {
		let contents = fs.readFileSync(fileName).toString();
		if (DEBUG) {
			cssFileContents += contents + '\r\n';
		} else {
			let lines = contents.split(/\r\n|\r|\n/g);
			for (let j = 0; j < lines.length; j++) {
				if (lines[j].startsWith('\t')) lines[j] = lines[j].substring(1);
			}
			let j = 0;
			while (j < lines.length) {
				if (lines[j].startsWith('/*') && lines[j].endsWith('*/')) {
					lines.splice(j, 1);
				} else {
					j++;
				}
			}
			cssFileContents += lines.join('');
		}
	});
	fs.writeFileSync(path.join(MEDIA_DIRECTORY, outFile), cssFileContents);
}

console.log('Packaging Mode = ' + (DEBUG ? 'DEBUG' : 'PRODUCTION'));

// Tab bundle: everything compiled from web/ except web/sidebar/'s own files - i.e. the existing
// top-level *.ts files, web/main/**, and (once populated) web/common/**. Ordering unchanged from
// before this file supported a second bundle: utils.js first, common/** next, everything else
// alphabetically, main.js last.
const tabBundle = buildJsBundle({
	label: 'Tab',
	include: (relPath) => !relPath.startsWith(SIDEBAR_SCOPE_PREFIX),
	priorityPrefix: COMMON_SCOPE_PREFIX,
	firstFile: UTILS_JS_FILE,
	lastFile: MAIN_JS_FILE,
	tmpFile: OUTPUT_TMP_JS_FILE,
	outFile: OUTPUT_MIN_JS_FILE,
});

// Sidebar bundle: web/common/** (shared, loaded first) plus web/sidebar/**, with sidebar/main.js
// (its bootstrap entry) pinned last, mirroring the tab's own main.js-last convention.
const sidebarBundle = buildJsBundle({
	label: 'Sidebar',
	include: (relPath) => relPath.startsWith(SIDEBAR_SCOPE_PREFIX) || relPath.startsWith(COMMON_SCOPE_PREFIX),
	priorityPrefix: COMMON_SCOPE_PREFIX,
	firstFile: null,
	lastFile: SIDEBAR_MAIN_JS_FILE,
	tmpFile: SIDEBAR_OUTPUT_TMP_JS_FILE,
	outFile: SIDEBAR_OUTPUT_MIN_JS_FILE,
});

// Both bundles have now synchronously read every source file they need (the async work queued
// above only reads back the tmp files it just wrote) - safe to delete the whole compiled tree.
allCompiledJsFiles.forEach((filePath) => fs.unlinkSync(filePath));

// Deleting the compiled tree leaves tsc's directory skeleton behind - remove any dirs that are
// now empty so media/ only contains the bundles and the codicon font.
function removeEmptyDirsRecursive(dir) {
	fs.readdirSync(dir).forEach((entry) => {
		const full = path.join(dir, entry);
		if (fs.statSync(full).isDirectory()) removeEmptyDirsRecursive(full);
	});
	if (dir !== MEDIA_DIRECTORY && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}
removeEmptyDirsRecursive(MEDIA_DIRECTORY);

Promise.all([tabBundle, sidebarBundle]).catch((err) => {
	console.log('ERROR:');
	console.log(err);
	process.exit(1);
});

// Tab CSS bundle (unchanged): codicons + web/styles/*.css, main.css pinned first.
buildCssBundle({ stylesDir: STYLES_DIRECTORY, includeCodicons: true, outFile: OUTPUT_MIN_CSS_FILE });

// Sidebar CSS bundle: web/sidebar/styles/*.css only - codicons and other shared rules are
// already available to the sidebar webview via the tab's out.min.css, loaded alongside this one.
buildCssBundle({ stylesDir: SIDEBAR_STYLES_DIRECTORY, includeCodicons: false, outFile: SIDEBAR_OUTPUT_MIN_CSS_FILE });

fs.copyFileSync(CODICONS_FONT_FILE, path.join(MEDIA_DIRECTORY, CODICONS_FONT_OUTPUT_FILE));
