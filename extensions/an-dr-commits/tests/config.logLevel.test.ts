import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { getConfig } from '../src/config';
import { LogLevel } from '../src/types';

const workspaceConfiguration = vscode.mocks.workspaceConfiguration;

describe('Config.logLevel', () => {
	it('Should return LogLevel.Debug when the configuration value is "Debug"', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

		// Run
		const value = getConfig().logLevel;

		// Assert
		expect(workspaceConfiguration.get).toBeCalledWith('logLevel', 'Info');
		expect(value).toBe(LogLevel.Debug);
	});

	it('Should return LogLevel.Warning when the configuration value is "Warning"', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('logLevel', 'Warning');

		// Run
		const value = getConfig().logLevel;

		// Assert
		expect(workspaceConfiguration.get).toBeCalledWith('logLevel', 'Info');
		expect(value).toBe(LogLevel.Warning);
	});

	it('Should return LogLevel.Error when the configuration value is "Error"', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('logLevel', 'Error');

		// Run
		const value = getConfig().logLevel;

		// Assert
		expect(workspaceConfiguration.get).toBeCalledWith('logLevel', 'Info');
		expect(value).toBe(LogLevel.Error);
	});

	it('Should return the default value (LogLevel.Info) when the configuration value is invalid', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('logLevel', 'invalid');

		// Run
		const value = getConfig().logLevel;

		// Assert
		expect(workspaceConfiguration.get).toBeCalledWith('logLevel', 'Info');
		expect(value).toBe(LogLevel.Info);
	});

	it('Should return the default value (LogLevel.Info) when the configuration value is not set', () => {
		// Run
		const value = getConfig().logLevel;

		// Assert
		expect(workspaceConfiguration.get).toBeCalledWith('logLevel', 'Info');
		expect(value).toBe(LogLevel.Info);
	});
});
