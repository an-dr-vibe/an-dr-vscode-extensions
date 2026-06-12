// Scenario tests for Settings module.

import { workspace } from '../__mocks__/vscode';
import { Settings } from '../config/Settings';

function mockCfg(values: Record<string, unknown>) {
    (workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(<T>(key: string, def: T): T => (key in values ? values[key] as T : def)),
        update: jest.fn(),
    });
}

beforeEach(() => jest.clearAllMocks());

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
        // Settings reads the value with no bounds check.
        // Math.min(anyDepth, 0) = 0 → every analysis gets depth=0.
        expect(Settings.maxDepth()).toBe(0);
    });
});

describe('Settings namespace', () => {
    it('getConfiguration is called with the extension namespace', () => {
        mockCfg({});
        Settings.maxDepth();
        expect(workspace.getConfiguration).toHaveBeenCalledWith('an-dr-code-analysis');
    });
});
