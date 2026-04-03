import * as vscode from 'vscode';
import { getConfig } from './config';
import { LogLevel } from './types';
import { Disposable } from './utils/disposable';

const DOUBLE_QUOTE_REGEXP = /"/g;
const LOG_LEVEL_LABELS: { [level in LogLevel]: string } = {
	[LogLevel.Debug]: 'DEBUG',
	[LogLevel.Info]: 'INFO',
	[LogLevel.Warning]: 'WARN',
	[LogLevel.Error]: 'ERROR'
};

/**
 * Manages the Commits Logger, which writes log information to the an-dr-commits Output Channel.
 */
export class Logger extends Disposable {
	private readonly channel: vscode.OutputChannel;

	/**
	 * Creates the Commits Logger.
	 */
	constructor() {
		super();
		this.channel = vscode.window.createOutputChannel('an-dr-commits');
		this.registerDisposable(this.channel);
	}

	/**
	 * Log a message to the Output Channel.
	 * @param message The string to be logged.
	 */
	public log(message: string) {
		this.logInfo(message);
	}

	/**
	 * Log an informational message to the Output Channel.
	 * @param message The string to be logged.
	 */
	public logInfo(message: string) {
		this.write(LogLevel.Info, message);
	}

	/**
	 * Log a debug message to the Output Channel.
	 * @param message The string to be logged.
	 */
	public logDebug(message: string) {
		this.write(LogLevel.Debug, message);
	}

	/**
	 * Log a warning message to the Output Channel.
	 * @param message The string to be logged.
	 */
	public logWarning(message: string) {
		this.write(LogLevel.Warning, message);
	}

	/**
	 * Log the execution of a spawned command to the Output Channel.
	 * @param cmd The command being spawned.
	 * @param args The arguments passed to the command.
	 */
	public logCmd(cmd: string, args: string[]) {
		this.logDebug('> ' + cmd + ' ' + args.map((arg) => arg === ''
			? '""'
			: arg.startsWith('--format=')
				? '--format=...'
				: arg.includes(' ')
					? '"' + arg.replace(DOUBLE_QUOTE_REGEXP, '\\"') + '"'
					: arg
		).join(' '));
	}

	/**
	 * Log an error message to the Output Channel.
	 * @param message The string to be logged.
	 */
	public logError(message: string) {
		this.write(LogLevel.Error, message);
	}

	private write(level: LogLevel, message: string) {
		if (level < getConfig().logLevel) return;

		const date = new Date();
		const timestamp = date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds()) + '.' + pad3(date.getMilliseconds());
		this.channel.appendLine('[' + timestamp + '] ' + LOG_LEVEL_LABELS[level] + ': ' + message);
	}
}

/**
 * Pad a number with a leading zero if it is less than two digits long.
 * @param n The number to be padded.
 * @returns The padded number.
 */
function pad2(n: number) {
	return (n > 9 ? '' : '0') + n;
}

/**
 * Pad a number with leading zeros if it is less than three digits long.
 * @param n The number to be padded.
 * @returns The padded number.
 */
function pad3(n: number) {
	return (n > 99 ? '' : n > 9 ? '0' : '00') + n;
}
