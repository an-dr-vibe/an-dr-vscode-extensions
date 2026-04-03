import * as date from './mocks/date';
import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { Logger } from '../src/logger';

const outputChannel = vscode.mocks.outputChannel;

describe('Logger', () => {
	let logger: Logger;
	beforeEach(() => {
		logger = new Logger();
	});
	afterEach(() => {
		logger.dispose();
	});

	it('Should create and dispose an output channel', () => {
		// Run
		logger.dispose();

		// Assert
		expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Git Graph');
		expect(outputChannel.dispose).toBeCalledTimes(1);
	});

	it('Should log a message to the Output Channel', () => {
		// Run
		logger.log('Test');

		// Assert
		expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] INFO: Test');
	});

	it('Should not log a debug message when the log level is Info', () => {
		// Run
		logger.logDebug('Test');

		// Assert
		expect(outputChannel.appendLine).not.toHaveBeenCalled();
	});

	it('Should log a debug message when the log level is Debug', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

		// Run
		logger.logDebug('Test');

		// Assert
		expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] DEBUG: Test');
	});

	describe('Should log a command to the Output Channel', () => {
		it('Standard arguments are unchanged', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

			// Run
			logger.logCmd('git', ['cmd', '-f', '--arg1']);

			// Assert
			expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] DEBUG: > git cmd -f --arg1');
		});

		it('Format arguments are abbreviated', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

			// Run
			logger.logCmd('git', ['cmd', '--format="format-string"']);

			// Assert
			expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] DEBUG: > git cmd --format=...');
		});

		it('Arguments with spaces are surrounded with double quotes', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

			// Run
			logger.logCmd('git', ['cmd', 'argument with spaces']);

			// Assert
			expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] DEBUG: > git cmd "argument with spaces"');
		});

		it('Arguments with spaces are surrounded with double quotes, and any internal double quotes are escaped', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

			// Run
			logger.logCmd('git', ['cmd', 'argument with "double quotes" and spaces']);

			// Assert
			expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] DEBUG: > git cmd "argument with \\"double quotes\\" and spaces"');
		});

		it('Empty string arguments are shown as two double quotes', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');

			// Run
			logger.logCmd('git', ['cmd', '']);

			// Assert
			expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.000] DEBUG: > git cmd ""');
		});

		it('Should transform all arguments of a command, when logging it to the Output Channel', () => {
			// Setup
			vscode.mockExtensionSettingReturnValue('logLevel', 'Debug');
			date.setCurrentTime(1587559258.1);

			// Run
			logger.logCmd('git', ['cmd', '--arg1', '--format="format-string"', '', 'argument with spaces', 'argument with "double quotes" and spaces']);

			// Assert
			expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.100] DEBUG: > git cmd --arg1 --format=... "" "argument with spaces" "argument with \\"double quotes\\" and spaces"');
		});
	});

	it('Should log a warning to the Output Channel', () => {
		// Setup
		date.setCurrentTime(1587559258.01);

		// Run
		logger.logWarning('Test');

		// Assert
		expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.010] WARN: Test');
	});

	it('Should log an error to the Output Channel', () => {
		// Setup
		date.setCurrentTime(1587559258.01);

		// Run
		logger.logError('Test');

		// Assert
		expect(outputChannel.appendLine).toHaveBeenCalledWith('[2020-04-22 12:40:58.010] ERROR: Test');
	});
});
