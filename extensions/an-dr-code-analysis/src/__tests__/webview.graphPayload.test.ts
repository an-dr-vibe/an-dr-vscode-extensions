import { Uri, workspace } from 'vscode';
import { GraphModel } from '../../shared/graph/GraphModel';
import { withWorkspaceRoot } from '../webview/graphPayload';

function graph(): GraphModel {
    return {
        graphType: 'callGraph',
        targetId: 'a',
        nodes: [{ id: 'a', label: 'a', fullName: 'a', role: 'target' }],
        edges: [],
        depth: 1,
        tool: 'test',
        confidence: 'high',
    };
}

describe('withWorkspaceRoot', () => {
    afterEach(() => {
        (workspace as any).__setWorkspaceFolders(undefined);
    });

    it('adds the primary workspace root to graph payloads', () => {
        (workspace as any).__setWorkspaceFolders([{ uri: Uri.file('/workspace/project'), name: 'project', index: 0 }]);

        expect(withWorkspaceRoot(graph()).workspaceRoot).toBe('/workspace/project');
    });

    it('preserves an existing graph workspace root', () => {
        (workspace as any).__setWorkspaceFolders([{ uri: Uri.file('/workspace/project'), name: 'project', index: 0 }]);

        expect(withWorkspaceRoot({ ...graph(), workspaceRoot: '/custom/root' }).workspaceRoot).toBe('/custom/root');
    });
});
