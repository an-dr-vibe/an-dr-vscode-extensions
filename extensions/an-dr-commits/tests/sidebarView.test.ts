import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { GitChangeCounts } from '../src/dataSource';
import { SidebarView } from '../src/views/sidebar/sidebarView';
import { EventEmitter } from '../src/utils/event';
import { UiDensity } from '../src/types';

function mockDataSource(changes: any[]) {
	return {
		getWorkingTreeChanges: jest.fn(() => Promise.resolve({ changes, error: null })),
		getHeadInfo: jest.fn(() => Promise.resolve(null)),
		stageFiles: jest.fn(() => Promise.resolve(null)),
		unstageFiles: jest.fn(() => Promise.resolve(null)),
		discardFileChanges: jest.fn(() => Promise.resolve(null)),
		commitChanges: jest.fn(() => Promise.resolve(null)),
		onDidAdvanceGraphGeneration: jest.fn(() => ({ dispose: jest.fn() }))
	};
}

function createSidebarView(dataSource: any, counts: GitChangeCounts = { modified: 0, deleted: 0 }) {
	const repoSelection = new EventEmitter<any>();
	const statusChanges = new EventEmitter<any>();
	const extensionState = {
		getLastActiveRepo: jest.fn(() => null),
		setLastActiveRepo: jest.fn(),
		getActivityGraphHeight: jest.fn(() => 150),
		setActivityGraphHeight: jest.fn()
	};
	const repoManager = {
		getRepos: jest.fn(() => ({ '/repo': { starred: false } })),
		findKnownRepoPath: jest.fn((repo: string) => repo === '/repo' ? repo : null),
		getRepoContainingFile: jest.fn(() => null),
		isRepoStarred: jest.fn(() => false),
		onDidChangeRepos: jest.fn(() => ({ dispose: jest.fn() }))
	};
	const statusMonitor = {
		getActiveRepoPath: jest.fn(() => '/repo'),
		getStatus: jest.fn(() => ({ repo: '/repo', branchName: 'main', counts })),
		onDidChangeStatus: statusChanges.subscribe
	};
	return new SidebarView(vscode.mocks.extensionContext as any, dataSource, extensionState as any, repoManager as any, statusMonitor as any, repoSelection.subscribe, jest.fn());
}

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('SidebarView', () => {
	it('Should expose compact density and aligned mini-graph geometry', () => {
		vscode.mockExtensionSettingReturnValue('uiDensity', UiDensity.Compact);
		const view = createSidebarView(mockDataSource([]));

		const state = view['_buildInitialState'](null, [], [], [], null, { status: 'ready', data: null }, 150);

		expect(state.uiDensity).toBe(UiDensity.Compact);
		expect(state.graphConfig.grid.y).toBe(18);
		expect(state.graphConfig.grid.offsetY).toBe(9);
		vscode.mockExtensionSettingReturnValue('uiDensity', UiDensity.Normal);
		expect(view['_buildInitialState'](null, [], [], [], null, { status: 'ready', data: null }, 150).graphConfig.grid.y).toBe(20);
		vscode.mockExtensionSettingReturnValue('uiDensity', UiDensity.Big);
		expect(view['_buildInitialState'](null, [], [], [], null, { status: 'ready', data: null }, 150).graphConfig.grid.y).toBe(24);
		view.dispose();
	});

	it('Should serialize Open Commits and a clean working tree for client-side rendering', async () => {
		const dataSource = mockDataSource([]);
		const view = createSidebarView(dataSource);
		const webviewView = vscode.createWebviewView();

		vscode.mocks.webviewViewProviders[0].resolveWebviewView(webviewView);
		await flushPromises();

		expect(webviewView.webview.html).toContain('activityOpenCommits');
		expect(webviewView.webview.html).toContain('Open Commits');
		expect(webviewView.webview.html).toContain('sidebarInitialState');
		expect(webviewView.webview.html).toContain('"changes":[]');
		expect(webviewView.badge).toBeUndefined();
		expect(dataSource.getWorkingTreeChanges).toHaveBeenCalledWith('/repo');

		view.dispose();
	});

	it('Should serialize uncommitted changes for the activity webview', async () => {
		const dataSource = mockDataSource([
			{ path: 'src/staged.ts', status: 'M', staged: true, additions: 3, deletions: 1 },
			{ path: 'src/modified.ts', status: 'M', staged: false, additions: 8, deletions: 2 },
			{ path: 'src/new.ts', status: 'U', staged: false, additions: null, deletions: null }
		]);
		const view = createSidebarView(dataSource, { modified: 1, deleted: 1 });
		const webviewView = vscode.createWebviewView();

		vscode.mocks.webviewViewProviders[0].resolveWebviewView(webviewView);
		await flushPromises();

		expect(webviewView.webview.html).toContain('sidebarInitialState');
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
