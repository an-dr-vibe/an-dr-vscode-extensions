import * as vscode from 'vscode';

const NS = 'an-dr-code-analysis';

function cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(NS);
}

export const Settings = {
    callGraph: {
        depth(): number { return cfg().get<number>('analysis.callGraph.depth', 2); },
        hideExternal(): boolean { return cfg().get<boolean>('analysis.callGraph.hideExternal', true); },
    },
    fileDeps: {
        depth(): number { return cfg().get<number>('analysis.fileDeps.depth', 2); },
        hideExternal(): boolean { return cfg().get<boolean>('analysis.fileDeps.hideExternal', true); },
    },
    componentDeps: {
        hideExternal(): boolean { return cfg().get<boolean>('analysis.componentDeps.hideExternal', false); },
    },
    maxDepth(): number { return cfg().get<number>('analysis.maxDepth', 5); },
    tools: {
        clangdPath(): string { return cfg().get<string>('tools.clangdPath', ''); },
        rustAnalyzerPath(): string { return cfg().get<string>('tools.rustAnalyzerPath', ''); },
        ctagsPath(): string { return cfg().get<string>('tools.ctagsPath', ''); },
        cscopePath(): string { return cfg().get<string>('tools.cscopePath', ''); },
        compileCommandsPath(): string { return cfg().get<string>('tools.compileCommandsPath', ''); },
        fallbackTool(): 'auto' | 'cscope' | 'ctags' {
            return cfg().get<'auto' | 'cscope' | 'ctags'>('tools.fallbackTool', 'auto');
        },
    },
    clangd: {
        fallbackFlags(): string[] { return cfg().get<string[]>('clangd.fallbackFlags', []); },
        warnOnMissingCompileCommands(): boolean {
            return cfg().get<boolean>('clangd.warnOnMissingCompileCommands', true);
        },
        autoOfferRecovery(): boolean {
            return cfg().get<boolean>('clangd.autoOfferRecovery', true);
        },
    },
    ai: {
        enabled(): boolean { return cfg().get<boolean>('ai.enabled', false); },
        requireConfirmation(): boolean { return cfg().get<boolean>('ai.requireConfirmation', true); },
        extensionId(): string { return cfg().get<string>('ai.extensionId', 'an-dr.an-dr-ai'); },
    },
    ui: {
        showConfidenceBadge(): boolean { return cfg().get<boolean>('ui.showConfidenceBadge', true); },
        nodeLabelMaxSidebar(): number { return cfg().get<number>('ui.nodeLabel.maxLength.sidebar', 15); },
        nodeLabelMaxExpanded(): number { return cfg().get<number>('ui.nodeLabel.maxLength.expanded', 25); },
    },
};
