// Tests for the shared webview message protocol.
// Since the module only exports interfaces and re-exports, we validate
// structural conformance: that objects with the right shape are accepted
// by TypeScript (compile-time) and that discriminant fields have correct values.

import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    ToolsStatusMessage,
    ContextUpdateMessage,
    AnalysisResultMessage,
    AnalysisErrorMessage,
    AnalysisBusyMessage,
    ReadyMessage,
    RefreshToolsMessage,
    TogglePinMessage,
    RequestAnalysisMessage,
    DepthChangeMessage,
    NodeClickMessage,
    NodeDoubleClickMessage,
    RunCommandMessage,
    ToolStatus,
    RecoveryAction,
} from '../../shared/protocol/messages';
import { GraphModel } from '../../shared/graph/GraphModel';

// ── type discriminant helpers ────────────────────────────────────────────────

function isExtensionMsg(m: ExtensionToWebviewMessage): boolean {
    return ['toolsStatus', 'contextUpdate', 'analysisResult', 'analysisError', 'analysisBusy'].includes(m.type);
}

function isWebviewMsg(m: WebviewToExtensionMessage): boolean {
    return ['ready', 'refreshTools', 'showToolHelp', 'togglePin',
            'requestAnalysis', 'depthChange', 'nodeClick', 'nodeDoubleClick', 'runCommand']
        .includes(m.type);
}

// ── Extension → Webview ──────────────────────────────────────────────────────

describe('ToolsStatusMessage', () => {
    it('has correct type discriminant', () => {
        const msg: ToolsStatusMessage = { type: 'toolsStatus', tools: [] };
        expect(msg.type).toBe('toolsStatus');
        expect(isExtensionMsg(msg)).toBe(true);
    });

    it('accepts valid ToolStatus entries', () => {
        const tool: ToolStatus = { name: 'clangd', state: 'ok', group: 'c-cpp' };
        const msg: ToolsStatusMessage = { type: 'toolsStatus', tools: [tool] };
        expect(msg.tools[0].name).toBe('clangd');
        expect(msg.tools[0].state).toBe('ok');
        expect(msg.tools[0].group).toBe('c-cpp');
    });

    it('accepts ToolStatus with optional detail', () => {
        const tool: ToolStatus = { name: 'ctags', state: 'missing', group: 'universal', detail: 'not in PATH' };
        expect(tool.detail).toBe('not in PATH');
    });
});

describe('ContextUpdateMessage', () => {
    it('has correct type discriminant', () => {
        const msg: ContextUpdateMessage = {
            type: 'contextUpdate',
            context: {
                symbolSource: 'word', file: 'foo.c', filePath: '/src/foo.c',
                lang: 'C', langId: 'c', isPinned: false,
            },
        };
        expect(msg.type).toBe('contextUpdate');
        expect(isExtensionMsg(msg)).toBe(true);
    });

    it('accepts null context', () => {
        const msg: ContextUpdateMessage = { type: 'contextUpdate', context: null };
        expect(msg.context).toBeNull();
    });
});

describe('AnalysisResultMessage', () => {
    const graph: GraphModel = {
        graphType: 'callGraph', targetId: 'tid',
        nodes: [], edges: [], depth: 2, tool: 'clangd', confidence: 'high',
    };

    it('has correct type discriminant', () => {
        const msg: AnalysisResultMessage = { type: 'analysisResult', graph };
        expect(msg.type).toBe('analysisResult');
        expect(isExtensionMsg(msg)).toBe(true);
    });

    it('carries graph payload', () => {
        const msg: AnalysisResultMessage = { type: 'analysisResult', graph };
        expect(msg.graph.graphType).toBe('callGraph');
        expect(msg.graph.confidence).toBe('high');
    });
});

describe('AnalysisErrorMessage', () => {
    it('has correct type discriminant', () => {
        const msg: AnalysisErrorMessage = { type: 'analysisError', graphType: 'callGraph', message: 'oops' };
        expect(msg.type).toBe('analysisError');
        expect(isExtensionMsg(msg)).toBe(true);
    });

    it('accepts optional recoveryActions', () => {
        const action: RecoveryAction = { label: 'Run CMake', command: 'cmake.configure' };
        const msg: AnalysisErrorMessage = {
            type: 'analysisError', graphType: 'callGraph',
            message: 'no compile_commands', recoveryActions: [action],
        };
        expect(msg.recoveryActions![0].label).toBe('Run CMake');
    });
});

describe('AnalysisBusyMessage', () => {
    it('has correct type discriminant', () => {
        const msg: AnalysisBusyMessage = { type: 'analysisBusy', graphType: 'fileDeps' };
        expect(msg.type).toBe('analysisBusy');
        expect(isExtensionMsg(msg)).toBe(true);
    });
});

// ── Webview → Extension ──────────────────────────────────────────────────────

describe('ReadyMessage', () => {
    it('has correct type discriminant', () => {
        const msg: ReadyMessage = { type: 'ready' };
        expect(msg.type).toBe('ready');
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('RefreshToolsMessage', () => {
    it('has correct type discriminant', () => {
        const msg: RefreshToolsMessage = { type: 'refreshTools' };
        expect(msg.type).toBe('refreshTools');
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('TogglePinMessage', () => {
    it('has correct type discriminant', () => {
        const msg: TogglePinMessage = { type: 'togglePin' };
        expect(msg.type).toBe('togglePin');
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('RequestAnalysisMessage', () => {
    it('has correct type discriminant and carries graphType/depth', () => {
        const msg: RequestAnalysisMessage = { type: 'requestAnalysis', graphType: 'callGraph', depth: 3 };
        expect(msg.type).toBe('requestAnalysis');
        expect(msg.graphType).toBe('callGraph');
        expect(msg.depth).toBe(3);
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('DepthChangeMessage', () => {
    it('has correct type discriminant', () => {
        const msg: DepthChangeMessage = { type: 'depthChange', graphType: 'fileDeps', depth: 4 };
        expect(msg.type).toBe('depthChange');
        expect(msg.depth).toBe(4);
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('NodeClickMessage', () => {
    it('has correct type discriminant', () => {
        const msg: NodeClickMessage = { type: 'nodeClick', nodeId: 'n1', filePath: '/a.c', line: 10 };
        expect(msg.type).toBe('nodeClick');
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('NodeDoubleClickMessage', () => {
    it('has correct type discriminant', () => {
        const msg: NodeDoubleClickMessage = { type: 'nodeDoubleClick', nodeId: 'n1' };
        expect(msg.type).toBe('nodeDoubleClick');
        expect(isWebviewMsg(msg)).toBe(true);
    });
});

describe('RunCommandMessage', () => {
    it('has correct type discriminant', () => {
        const msg: RunCommandMessage = { type: 'runCommand', command: 'an-dr-code-analysis.selectCompileCommands' };
        expect(msg.type).toBe('runCommand');
        expect(isWebviewMsg(msg)).toBe(true);
    });

    it('accepts optional args array', () => {
        const msg: RunCommandMessage = { type: 'runCommand', command: 'foo', args: [1, 'two', true] };
        expect(msg.args).toHaveLength(3);
    });
});

// ── ToolStatus state values ──────────────────────────────────────────────────

describe('ToolStatus state values', () => {
    const states = ['ok', 'warn', 'missing'] as const;
    states.forEach(state => {
        it(`accepts state="${state}"`, () => {
            const t: ToolStatus = { name: 'test', state, group: 'universal' };
            expect(t.state).toBe(state);
        });
    });
});

describe('ToolStatus group values', () => {
    const groups = ['universal', 'c-cpp', 'rust', 'python', 'typescript'] as const;
    groups.forEach(group => {
        it(`accepts group="${group}"`, () => {
            const t: ToolStatus = { name: 'test', state: 'ok', group };
            expect(t.group).toBe(group);
        });
    });
});
