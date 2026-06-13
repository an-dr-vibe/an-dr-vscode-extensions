import { GraphModel, GraphType } from '../graph/GraphModel';
export type { GraphType };

export type ToolState = 'ok' | 'warn' | 'missing';
export type ToolGroup = 'universal' | 'c-cpp' | 'rust' | 'python' | 'typescript';

export interface ToolStatus {
    name: string;
    state: ToolState;
    group: ToolGroup;
    detail?: string;
}

// Shared editor context types — single source of truth imported by ContextTracker and webview.
export type SymbolSource = 'call-hierarchy' | 'document-symbol' | 'word';

export interface EditorContext {
    symbol?: string;
    symbolKind?: number;
    symbolSource: SymbolSource;
    file: string;
    filePath: string;
    lang: string;
    langId: string;
    isPinned: boolean;
}

// Extension → webview
export interface ToolsStatusMessage {
    type: 'toolsStatus';
    tools: ToolStatus[];
}

export interface ContextUpdateMessage {
    type: 'contextUpdate';
    context: EditorContext | null;
}

export interface AnalysisResultMessage {
    type: 'analysisResult';
    graph: GraphModel;
}

export interface AnalysisErrorMessage {
    type: 'analysisError';
    graphType: GraphType;
    message: string;
    recoveryActions?: RecoveryAction[];
}

export interface AnalysisBusyMessage {
    type: 'analysisBusy';
    graphType: GraphType;
    message?: string;
}

export interface AnalysisCancelledMessage {
    type: 'analysisCancelled';
    graphType: GraphType;
}

export interface RecoveryAction {
    label: string;
    command: string;
    args?: unknown[];
}

export interface ClangdHealthMessage {
    type: 'clangdHealth';
    issue: 'NO_COMPILE_COMMANDS' | 'STALE_COMPILE_COMMANDS' | 'CROSS_COMPILE' | null;
    message: string;
}

export type ExtensionToWebviewMessage =
    | ToolsStatusMessage
    | ContextUpdateMessage
    | AnalysisResultMessage
    | AnalysisErrorMessage
    | AnalysisBusyMessage
    | AnalysisCancelledMessage
    | ClangdHealthMessage;

// Webview → extension
export interface ReadyMessage {
    type: 'ready';
}

export interface RefreshToolsMessage {
    type: 'refreshTools';
}

export interface ShowToolHelpMessage {
    type: 'showToolHelp';
    toolName: string;
}

export interface TogglePinMessage {
    type: 'togglePin';
}

export interface RequestAnalysisMessage {
    type: 'requestAnalysis';
    graphType: GraphType;
    depth: number;
}

export interface DepthChangeMessage {
    type: 'depthChange';
    graphType: GraphType;
    depth: number;
}

export interface NodeClickMessage {
    type: 'nodeClick';
    nodeId: string;
    filePath?: string;
    line?: number;
}

export interface NodeDoubleClickMessage {
    type: 'nodeDoubleClick';
    nodeId: string;
    filePath?: string;
    line?: number;
}

export interface RunCommandMessage {
    type: 'runCommand';
    command: string;
    args?: unknown[];
}

export interface CancelAnalysisMessage {
    type: 'cancelAnalysis';
}

export interface ReanalyzeToMessage {
    type: 'reanalyzeTo';
    filePath: string;
    line: number;
    fullName?: string;
    graphType: GraphType;
    depth: number;
}

export interface ExpandToTabMessage {
    type: 'expandToTab';
    graph: GraphModel;
    depth: number;
}

export type WebviewToExtensionMessage =
    | ReadyMessage
    | RefreshToolsMessage
    | ShowToolHelpMessage
    | TogglePinMessage
    | RequestAnalysisMessage
    | DepthChangeMessage
    | NodeClickMessage
    | NodeDoubleClickMessage
    | RunCommandMessage
    | CancelAnalysisMessage
    | ReanalyzeToMessage
    | ExpandToTabMessage;
