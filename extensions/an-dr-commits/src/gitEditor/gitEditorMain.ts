/*---------------------------------------------------------------------------------------------
 *  This code is based on the git editor implementation in the Microsoft Visual Studio Code Git Extension
 *  https://github.com/microsoft/vscode/blob/473af338e1bd9ad4d9853933da1cd9d5d9e07dc9/extensions/git/src/git-editor-main.ts,
 *  which has the following copyright notice & license:
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See ./licenses/LICENSE_MICROSOFT for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';

function fatal(err: any): void {
	console.error('Unable to open the Git commit editor.');
	console.error(err);
	process.exit(1);
}

function main(argv: string[]): void {
	if (argv.length < 3) return fatal('Wrong number of arguments');
	if (!process.env['VSCODE_GIT_GRAPH_EDITOR_HANDLE']) return fatal('Missing handle');

	const commitMessagePath = argv[argv.length - 1];
	const socketPath = process.env['VSCODE_GIT_GRAPH_EDITOR_HANDLE']!;

	const req = http.request({ socketPath, path: '/', method: 'POST' }, res => {
		if (res.statusCode !== 200) return fatal('Bad status code: ' + res.statusCode);
		res.on('data', () => { });
		res.on('end', () => {
			setTimeout(() => process.exit(0), 0);
		});
	});

	req.on('error', () => fatal('Error in request'));
	req.write(JSON.stringify({ commitMessagePath }));
	req.end();
}

main(process.argv);
