/*---------------------------------------------------------------------------------------------
 *  This code is based on the git editor implementation in the Microsoft Visual Studio Code Git Extension
 *  https://github.com/microsoft/vscode/blob/473af338e1bd9ad4d9853933da1cd9d5d9e07dc9/extensions/git/src/gitEditor.ts,
 *  which has the following copyright notice & license:
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See ./licenses/LICENSE_MICROSOFT for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getNonce } from '../utils';
import { Disposable, toDisposable } from '../utils/disposable';

export interface GitEditorEnvironment {
	GIT_EDITOR?: string;
	VSCODE_GIT_GRAPH_EDITOR_NODE?: string;
	VSCODE_GIT_GRAPH_EDITOR_MAIN?: string;
	VSCODE_GIT_GRAPH_EDITOR_HANDLE?: string;
}

interface GitEditorRequest {
	commitMessagePath: string;
}

export class GitEditorManager extends Disposable {
	private readonly ipcHandlePath: string;
	private readonly server: http.Server;
	private readonly trackedCommitMessageUris = new Set<string>();
	private enabled = true;

	constructor() {
		super();
		this.ipcHandlePath = getIPCHandlePath(getNonce());
		this.server = http.createServer((req, res) => this.onRequest(req, res));
		try {
			this.server.listen(this.ipcHandlePath);
			this.server.on('error', () => { });
		} catch (_) {
			this.enabled = false;
		}
		fs.chmod(path.join(__dirname, 'git-editor.sh'), '755', () => { });
		fs.chmod(path.join(__dirname, 'git-editor-empty.sh'), '755', () => { });

		this.registerDisposable(
			toDisposable(() => {
				try {
					this.server.close();
					if (process.platform !== 'win32') {
						fs.unlinkSync(this.ipcHandlePath);
					}
				} catch (_) { }
			})
		);
	}

	public isEnabled() {
		return this.enabled;
	}

	public getEnv(): GitEditorEnvironment {
		return this.enabled
			? {
				GIT_EDITOR: '"' + path.join(__dirname, 'git-editor.sh') + '"',
				VSCODE_GIT_GRAPH_EDITOR_NODE: process.execPath,
				VSCODE_GIT_GRAPH_EDITOR_MAIN: path.join(__dirname, 'gitEditorMain.js'),
				VSCODE_GIT_GRAPH_EDITOR_HANDLE: this.ipcHandlePath
			}
			: {
				GIT_EDITOR: '"' + path.join(__dirname, 'git-editor-empty.sh') + '"'
			};
	}

	public async showCommitMessageEditor(initialContent: string): Promise<string | null> {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-commit-message-'));
		const commitMessagePath = path.join(tempDir, 'COMMIT_EDITMSG');
		fs.writeFileSync(commitMessagePath, initialContent, 'utf8');

		try {
			await this.openCommitMessageEditor(vscode.Uri.file(commitMessagePath), false);
			return fs.readFileSync(commitMessagePath, 'utf8');
		} finally {
			try {
				fs.unlinkSync(commitMessagePath);
			} catch (_) { }
			try {
				fs.rmdirSync(tempDir);
			} catch (_) { }
		}
	}

	public closeTrackedCommitMessageEditors() {
		if (this.trackedCommitMessageUris.size === 0) return;

		const trackedUris = Array.from(this.trackedCommitMessageUris);
		this.trackedCommitMessageUris.clear();

		const closeTabs = () => {
			const tabGroups = (vscode.window as any).tabGroups;
			if (!tabGroups || typeof tabGroups.close !== 'function' || !Array.isArray(tabGroups.all)) return;

			const tabsToClose: any[] = [];
			for (const group of tabGroups.all) {
				if (!group || !Array.isArray(group.tabs)) continue;
				for (const tab of group.tabs) {
					const input = tab.input;
					if (!!input && input.uri && trackedUris.indexOf(input.uri.toString()) >= 0) {
						tabsToClose.push(tab);
					}
				}
			}

			if (tabsToClose.length > 0) {
				void tabGroups.close(tabsToClose, true);
			}
		};

		closeTabs();
		setTimeout(closeTabs, 250);
		setTimeout(closeTabs, 1000);
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		let reqData = '';
		req.setEncoding('utf8');
		req.on('data', (d) => reqData += d);
		req.on('end', () => {
			const data = JSON.parse(reqData) as GitEditorRequest;
			this.openCommitMessageEditor(vscode.Uri.file(data.commitMessagePath)).then((result) => {
				res.writeHead(200);
				res.end(JSON.stringify(result));
			}, () => {
				res.writeHead(500);
				res.end();
			});
		});
	}

	private async openCommitMessageEditor(uri: vscode.Uri, trackUri: boolean = true): Promise<boolean> {
		if (uri.fsPath.trim() === '') return false;

		if (trackUri) {
			this.trackedCommitMessageUris.add(uri.toString());
		}
		let doc = await vscode.workspace.openTextDocument(uri);
		if (doc.languageId !== 'git-commit') {
			try {
				doc = await vscode.languages.setTextDocumentLanguage(doc, 'git-commit');
			} catch (_) { }
		}
		await vscode.window.showTextDocument(doc, { preview: false });

		return new Promise((resolve) => {
			const tabGroups = (vscode.window as any).tabGroups;
			if (tabGroups && typeof tabGroups.onDidChangeTabs === 'function') {
				const closeTabDisposable = tabGroups.onDidChangeTabs((event: any) => {
					if (Array.isArray(event.closed) && event.closed.some((tab: any) => {
						const input = tab.input;
						return !!input && input.uri && input.uri.toString() === uri.toString();
					})) {
						closeTabDisposable.dispose();
						resolve(true);
					}
				});
				return;
			}

			const closeDocDisposable = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
				if (closedDoc.uri.toString() === uri.toString()) {
					closeDocDisposable.dispose();
					resolve(true);
				}
			});
		});
	}
}

function getIPCHandlePath(nonce: string): string {
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\git-graph-editor-' + nonce + '-sock';
	} else if (process.env['XDG_RUNTIME_DIR']) {
		return path.join(process.env['XDG_RUNTIME_DIR'] as string, 'git-graph-editor-' + nonce + '.sock');
	} else {
		return path.join(os.tmpdir(), 'git-graph-editor-' + nonce + '.sock');
	}
}
