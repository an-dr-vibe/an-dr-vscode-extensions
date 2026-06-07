export type ToolState = 'ok' | 'warn' | 'missing';
export type ToolGroup = 'universal' | 'c-cpp' | 'rust' | 'python' | 'typescript';

export interface ToolStatus {
    name: string;
    state: ToolState;
    group: ToolGroup;
    detail?: string;
}

// Extension → webview
export interface ToolsStatusMessage {
    type: 'toolsStatus';
    tools: ToolStatus[];
}

export type ExtensionToWebviewMessage = ToolsStatusMessage;

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

export type WebviewToExtensionMessage = ReadyMessage | RefreshToolsMessage | ShowToolHelpMessage;
