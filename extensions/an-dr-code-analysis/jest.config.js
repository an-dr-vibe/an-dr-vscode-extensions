/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/__mocks__/**',
        '!src/__tests__/**',
        '!src/extension.ts',
        '!src/webview/webviewHtml.ts',
        '!src/tools/ToolHelpPanel.ts',
        '!src/tools/toolHelp.ts',
    ],
};
