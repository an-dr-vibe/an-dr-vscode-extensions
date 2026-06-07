export type ToolState = 'ok' | 'warn' | 'missing';
export type ToolGroup = 'universal' | 'c-cpp' | 'rust' | 'python' | 'typescript';

export interface ToolStatus {
    name: string;
    state: ToolState;
    group: ToolGroup;
    detail?: string;
}

export interface EditorContext {
    symbol?: string;
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

export type ExtensionToWebviewMessage = ToolsStatusMessage | ContextUpdateMessage;

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

export type WebviewToExtensionMessage =
    | ReadyMessage
    | RefreshToolsMessage
    | ShowToolHelpMessage
    | TogglePinMessage;
