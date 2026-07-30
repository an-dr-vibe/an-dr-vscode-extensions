import * as vscode from "vscode";

/** Severity of a log record, ordered least to most severe. */
export type LogLevel = "Debug" | "Info" | "Warning" | "Error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  Debug: 0,
  Info: 1,
  Warning: 2,
  Error: 3
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  Debug: "DEBUG",
  Info: "INFO",
  Warning: "WARN",
  Error: "ERROR"
};

let _channel: vscode.OutputChannel | undefined;
let _minimumLevel: LogLevel = "Info";

/** Whether a record at `level` clears the configured threshold. */
export function isLevelEnabled(level: LogLevel, minimum: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minimum];
}

function write(level: LogLevel, msg: string) {
  if (!_channel) {
    // eslint-disable-next-line no-console
    console.warn("[Neo Git Graph] log() called before initLogger()");
    return;
  }
  if (!isLevelEnabled(level, _minimumLevel)) {
    return;
  }
  const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
  _channel.appendLine(`[${timestamp}] [${LEVEL_LABELS[level]}] ${msg}`);
}

export const logger = {
  init: (ctx: vscode.ExtensionContext) => {
    _channel = vscode.window.createOutputChannel("Neo Git Graph");
    ctx.subscriptions.push(_channel);
  },

  /**
   * Sets the lowest severity that reaches the output channel, so raising the
   * threshold quiets the channel without touching any call site.
   */
  setLevel: (level: LogLevel) => {
    _minimumLevel = level;
  },

  /** Logs at Info, which is what every existing call site means. */
  log: (msg: string) => write("Info", msg),
  debug: (msg: string) => write("Debug", msg),
  warn: (msg: string) => write("Warning", msg),
  error: (msg: string) => write("Error", msg)
};
