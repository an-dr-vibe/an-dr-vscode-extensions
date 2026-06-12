import * as vscode from 'vscode';

const NS = 'an-dr-code-analysis';

function cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(NS);
}

export const Settings = {
    maxDepth(): number { return cfg().get<number>('analysis.maxDepth', 5); },
};
