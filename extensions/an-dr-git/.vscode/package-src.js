const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC_DIRECTORY = './src';
const OUT_DIRECTORY = './out';
const SHELL_SCRIPT_DIRECTORIES = ['askpass', 'gitEditor'];

// Adjust any scripts that require the Node.js File System Module to use the Node.js version (as Electron overrides the fs module with its own version of the module)
fs.readdirSync(OUT_DIRECTORY).forEach((fileName) => {
	if (fileName.endsWith('.js')) {
		const scriptFilePath = path.join(OUT_DIRECTORY, fileName);
		const mapFilePath = scriptFilePath + '.map';

		let script = fs.readFileSync(scriptFilePath).toString();
		if (script.match(/require\("fs"\)/g)) {
			// Adjust the requirement
			script = script.replace('"use strict";', '"use strict";\r\nfunction requireWithFallback(electronModule, nodeModule) { try { return require(electronModule); } catch (err) {} return require(nodeModule); }');
			fs.writeFileSync(scriptFilePath, script.replace(/require\("fs"\)/g, 'requireWithFallback("original-fs", "fs")'));

			// Adjust the mapping file, as we added requireWithFallback on a new line at the start of the file.
			let data = JSON.parse(fs.readFileSync(mapFilePath).toString());
			data.mappings = ';' + data.mappings;
			fs.writeFileSync(mapFilePath, JSON.stringify(data));
		}
	}
});

// Copy shell scripts to the output directory
SHELL_SCRIPT_DIRECTORIES.forEach((directory) => {
	fs.readdirSync(path.join(SRC_DIRECTORY, directory)).forEach((fileName) => {
		if (fileName.endsWith('.sh')) {
			const scriptContents = fs.readFileSync(path.join(SRC_DIRECTORY, directory, fileName)).toString();
			fs.writeFileSync(path.join(OUT_DIRECTORY, directory, fileName), scriptContents);
		}
	});
});
