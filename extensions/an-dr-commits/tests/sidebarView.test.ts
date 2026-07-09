import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { SidebarView, countChanges, getWorkingTreeChanges } from '../src/views/sidebar/sidebarView';

function mockRepo(root: string, workingTreeChanges: any[] = [], indexChanges: any[] = [], mergeChanges: any[] = []) {
	return {
		rootUri: vscode.Uri.file(root),
		state: {
			workingTreeChanges,
			indexChanges,
			mergeChanges,
			onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
		}
	};
}

function gitChange(filePath: string, status: number) {
	return { uri: vscode.Uri.file(filePath), status };
}

function mockGitApi(repo: any) {
	const api = {
		repositories: [repo],
		getRepository: jest.fn(() => repo),
		onDidOpenRepository: jest.fn(() => ({ dispose: jest.fn() }))
	};
	vscode.mockExtension('vscode.git', {
		isActive: true,
		exports: { getAPI: () => api }
	});
	return api;
}

function mockDataSource(changes: any[]) {
	return {
		getWorkingTreeChanges: jest.fn(() => Promise.resolve({ changes, error: null })),
		stageFiles: jest.fn(() => Promise.resolve(null)),
		unstageFiles: jest.fn(() => Promise.resolve(null)),
		discardFileChanges: jest.fn(() => Promise.resolve(null)),
		commitChanges: jest.fn(() => Promise.resolve(null))
	};
}

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('SidebarView', () => {
	it('Should collect deduped uncommitted files for badge counts', () => {
		const repo = mockRepo('/repo', [
			gitChange('/repo/src/modified.ts', 5),
			gitChange('/repo/src/deleted.ts', 6),
			gitChange('/repo/ignored.log', 8)
		], [
			gitChange('/repo/src/modified.ts', 0),
			gitChange('/repo/src/staged.ts', 0)
		]);

		const changes = getWorkingTreeChanges(repo);

		expect(changes.map((change) => change.relativePath)).toStrictEqual([
			'src/deleted.ts',
			'src/modified.ts',
			'src/staged.ts'
		]);
		expect(countChanges(repo)).toStrictEqual({ modified: 2, deleted: 1 });
	});

	it('Should render Open Commits and the clean working tree placeholder', async () => {
		const repo = mockRepo('/repo');
		mockGitApi(repo);
		const dataSource = mockDataSource([]);
		const view = new SidebarView(vscode.mocks.extensionContext as any, dataSource as any);
		const webviewView = vscode.createWebviewView();

		vscode.mocks.webviewViewProviders[0].resolveWebviewView(webviewView);
		await flushPromises();

		expect(webviewView.webview.html).toContain('activityOpenCommits');
		expect(webviewView.webview.html).toContain('Open Commits');
		expect(webviewView.webview.html).toContain('No uncommitted changes.');
		expect(webviewView.badge).toBeUndefined();
		expect(dataSource.getWorkingTreeChanges).toHaveBeenCalledWith('/repo');

		view.dispose();
	});

	it('Should render the same uncommitted changes panel sections in the activity webview', async () => {
		const repo = mockRepo('/repo', [
			gitChange('/repo/src/modified.ts', 5),
			gitChange('/repo/src/deleted.ts', 6)
		]);
		mockGitApi(repo);
		const dataSource = mockDataSource([
			{ path: 'src/staged.ts', status: 'M', staged: true, additions: 3, deletions: 1 },
			{ path: 'src/modified.ts', status: 'M', staged: false, additions: 8, deletions: 2 },
			{ path: 'src/new.ts', status: 'U', staged: false, additions: null, deletions: null }
		]);
		const view = new SidebarView(vscode.mocks.extensionContext as any, dataSource as any);
		const webviewView = vscode.createWebviewView();

		vscode.mocks.webviewViewProviders[0].resolveWebviewView(webviewView);
		await flushPromises();

		expect(webviewView.webview.html).toContain('Staged Changes');
		expect(webviewView.webview.html).toContain('Changes');
		expect(webviewView.webview.html).toContain('staged.ts');
		expect(webviewView.webview.html).toContain('modified.ts');
		expect(webviewView.webview.html).toContain('new.ts');
		expect(webviewView.webview.html).toContain('cpCommitBtn');
		expect(webviewView.badge).toStrictEqual({
			value: 2,
			tooltip: '1 modified, 1 deleted'
		});

		view.dispose();
	});
});
