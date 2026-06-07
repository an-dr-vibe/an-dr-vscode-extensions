// Scenario tests for Settings module.
// Models a user who customizes extension settings in their VS Code preferences,
// then opens a file and expects the settings to take effect.

import { workspace } from '../__mocks__/vscode';
import { Settings } from '../config/Settings';

function mockCfg(values: Record<string, unknown>) {
    (workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(<T>(key: string, def: T): T => (key in values ? values[key] as T : def)),
        update: jest.fn(),
    });
}

beforeEach(() => jest.clearAllMocks());

// ── Scenario: user sets callGraph depth to 4 ─────────────────────────────────

describe('Settings.callGraph.depth', () => {
    it('returns configured value', () => {
        mockCfg({ 'analysis.callGraph.depth': 4 });
        expect(Settings.callGraph.depth()).toBe(4);
    });

    it('returns default 2 when not configured', () => {
        mockCfg({});
        expect(Settings.callGraph.depth()).toBe(2);
    });
});

// ── Scenario: user sets maxDepth to 3, requests depth 10 → clamped ───────────

describe('Settings.maxDepth', () => {
    it('returns configured value', () => {
        mockCfg({ 'analysis.maxDepth': 3 });
        expect(Settings.maxDepth()).toBe(3);
    });

    it('returns default 5 when not configured', () => {
        mockCfg({});
        expect(Settings.maxDepth()).toBe(5);
    });

    it('BUG: maxDepth has no minimum guard — user can set 0 or negative and get 0', () => {
        mockCfg({ 'analysis.maxDepth': 0 });
        // Settings just reads the value with no bounds check.
        // Math.min(anyDepth, 0) = 0 → every analysis gets depth=0 forever.
        expect(Settings.maxDepth()).toBe(0);
    });
});

// ── Scenario: user sets hideExternal = false ──────────────────────────────────

describe('Settings.callGraph.hideExternal', () => {
    it('returns false when explicitly set to false', () => {
        mockCfg({ 'analysis.callGraph.hideExternal': false });
        expect(Settings.callGraph.hideExternal()).toBe(false);
    });

    it('returns default true when not configured', () => {
        mockCfg({});
        expect(Settings.callGraph.hideExternal()).toBe(true);
    });

    it('BUG: hideExternal is read but never used in any analyzer or graph builder', () => {
        // The setting exists in package.json and Settings.ts but is never consumed by
        // LspAnalyzer, CtagsAnalyzer, or GraphBuilder. It is a dead setting.
        mockCfg({ 'analysis.callGraph.hideExternal': false });
        const value = Settings.callGraph.hideExternal();
        // We can confirm the value is readable:
        expect(typeof value).toBe('boolean');
        // But nothing in the codebase checks it — this is a dead setting.
        // (No assertion about behaviour change because there is none.)
    });
});

// ── Scenario: user configures tools.clangdPath ───────────────────────────────

describe('Settings.tools.clangdPath', () => {
    it('returns configured path', () => {
        mockCfg({ 'tools.clangdPath': '/usr/local/bin/clangd-15' });
        expect(Settings.tools.clangdPath()).toBe('/usr/local/bin/clangd-15');
    });

    it('BUG: clangdPath is read by Settings but NEVER passed to LspClient or LspAnalyzer', () => {
        // The user sets a custom clangd path expecting their version to be used.
        // But ToolRegistry only checks availability via `where`/`which` — it does not
        // use the configured path. And LspClient uses `vscode.prepareCallHierarchy`
        // which invokes whatever clangd VS Code's clangd extension has running.
        // The clangdPath setting is completely inert.
        mockCfg({ 'tools.clangdPath': '/custom/clangd' });
        const p = Settings.tools.clangdPath();
        expect(p).toBe('/custom/clangd');
        // No code reads this value to actually invoke clangd at that path.
    });

    it('BUG: ctagsPath is read by Settings but NEVER passed to CtagsAnalyzer', () => {
        // User wants to use a specific ctags binary (e.g. universal-ctags vs exuberant-ctags).
        // CtagsAnalyzer always calls 'ctags' — the configured ctagsPath is never used.
        mockCfg({ 'tools.ctagsPath': '/usr/local/bin/ctags' });
        const p = Settings.tools.ctagsPath();
        expect(p).toBe('/usr/local/bin/ctags');
        // CtagsAnalyzer ignores this — always invokes bare 'ctags'.
    });

    it('BUG: compileCommandsPath is read by Settings but NEVER passed to LspAnalyzer or ClangdHealth', () => {
        // User sets a known compile_commands.json path via selectCompileCommands.
        // The setting is saved but neither LspAnalyzer nor ClangdHealth reads it.
        // ClangdHealth only looks at workspace_root/compile_commands.json.
        mockCfg({ 'tools.compileCommandsPath': '/build/compile_commands.json' });
        const p = Settings.tools.compileCommandsPath();
        expect(p).toBe('/build/compile_commands.json');
        // Neither LspAnalyzer nor ClangdHealth reads this setting.
    });
});

// ── Scenario: user sets fallbackTool = 'cscope' ──────────────────────────────

describe('Settings.tools.fallbackTool', () => {
    it('BUG: fallbackTool setting is read but NEVER consulted by AnalyzerFactory', () => {
        // User sets fallbackTool='cscope' expecting cscope to be used instead of ctags.
        // But AnalyzerFactory always builds [LspAnalyzer, CtagsAnalyzer] regardless of this setting.
        mockCfg({ 'tools.fallbackTool': 'cscope' });
        expect(Settings.tools.fallbackTool()).toBe('cscope');
        // The chain is always ctags — cscope is never in the chain.
    });

    it('returns "auto" by default', () => {
        mockCfg({});
        expect(Settings.tools.fallbackTool()).toBe('auto');
    });
});

// ── Scenario: user configures clangd.fallbackFlags ───────────────────────────

describe('Settings.clangd.fallbackFlags', () => {
    it('BUG: fallbackFlags is read but never passed to clangd', () => {
        // User adds fallback compile flags for header files without compile_commands.json.
        // These are never passed anywhere — LspClient just calls vscode.prepareCallHierarchy
        // with no way to inject flags.
        mockCfg({ 'clangd.fallbackFlags': ['-std=c++17', '-I/usr/include'] });
        const flags = Settings.clangd.fallbackFlags();
        expect(flags).toEqual(['-std=c++17', '-I/usr/include']);
        // No component in the extension reads these flags and passes them to clangd.
    });

    it('returns empty array by default', () => {
        mockCfg({});
        expect(Settings.clangd.fallbackFlags()).toEqual([]);
    });
});

// ── Scenario: user enables AI fallback ───────────────────────────────────────

describe('Settings.ai', () => {
    it('BUG: ai.enabled and ai.extensionId are read but AI analyzer is not implemented', () => {
        mockCfg({ 'ai.enabled': true, 'ai.extensionId': 'an-dr.an-dr-ai' });
        expect(Settings.ai.enabled()).toBe(true);
        expect(Settings.ai.extensionId()).toBe('an-dr.an-dr-ai');
        // AnalyzerFactory never creates an AI analyzer. These settings are dead.
    });

    it('ai.requireConfirmation defaults to true', () => {
        mockCfg({});
        expect(Settings.ai.requireConfirmation()).toBe(true);
    });
});

// ── Scenario: Settings namespace is correct ───────────────────────────────────

describe('Settings namespace', () => {
    it('getConfiguration is always called with the extension namespace', () => {
        mockCfg({});
        Settings.callGraph.depth();
        expect(workspace.getConfiguration).toHaveBeenCalledWith('an-dr-code-analysis');
    });

    it('BUG: getConfiguration is called fresh on every Settings read — no caching', () => {
        // Every Settings.xxx() call invokes workspace.getConfiguration() independently.
        // This means 5 settings reads = 5 getConfiguration calls, even within the same pipeline run.
        mockCfg({});
        Settings.callGraph.depth();
        Settings.callGraph.hideExternal();
        Settings.maxDepth();
        Settings.tools.clangdPath();
        Settings.ai.enabled();
        expect(workspace.getConfiguration).toHaveBeenCalledTimes(5);
    });
});

// ── Scenario: UI settings ─────────────────────────────────────────────────────

describe('Settings.ui', () => {
    it('BUG: nodeLabelMaxSidebar and nodeLabelMaxExpanded are read but never used in graph rendering', () => {
        // User sets a shorter label cap expecting truncation in the sidebar.
        // CytoscapeRenderer and GraphBuilder don't read these settings.
        mockCfg({ 'ui.nodeLabel.maxLength.sidebar': 8 });
        expect(Settings.ui.nodeLabelMaxSidebar()).toBe(8);
        // Nothing truncates labels to this length.
    });

    it('showConfidenceBadge returns true by default', () => {
        mockCfg({});
        expect(Settings.ui.showConfidenceBadge()).toBe(true);
    });
});

// ── Scenario: fileDeps settings are orphaned (feature not implemented) ────────

describe('Settings.fileDeps', () => {
    it('BUG: fileDeps.depth and fileDeps.hideExternal are settings for an unimplemented feature', () => {
        mockCfg({ 'analysis.fileDeps.depth': 3, 'analysis.fileDeps.hideExternal': false });
        expect(Settings.fileDeps.depth()).toBe(3);
        expect(Settings.fileDeps.hideExternal()).toBe(false);
        // Iteration 8 (fileDeps) is not implemented yet — these settings configure nothing.
    });
});
