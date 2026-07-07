import * as vscode from 'vscode';

export interface StartupTiming {
    loadCodeMs: number;
    callActivateMs: number;
    finishActivateMs: number;
    totalMs: number;
}

// "Developer: Startup Performance" opens a report document with a markdown table under
// "## Extension Activation Stats" (id, Eager, Load Code, Call Activate, Finish Activate,
// Event, By). There is no public API for per-extension activation time (see ADR), so we
// run the command, capture the document it opens, parse that table, and close it again.
// Resolves undefined when no report could be captured, so callers can keep previous data.
export async function collectStartupTimings(): Promise<Map<string, StartupTiming> | undefined> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result: Map<string, StartupTiming> | undefined) => {
            if (settled) {
                return;
            }
            settled = true;
            disposable.dispose();
            resolve(result);
        };

        // If the report tab is already open (e.g. from a previous manual "Developer:
        // Startup Performance" run), re-running the command reveals the existing document
        // instead of opening a new one, so onDidOpenTextDocument never fires for it. Try
        // the already-open document first as well as listening for a fresh one.
        const tryCapture = (doc: vscode.TextDocument): boolean => {
            if (doc.uri.scheme !== 'perf') {
                return false;
            }
            const text = doc.getText();
            if (!text.includes('Extension Activation Stats')) {
                return false;
            }
            const timings = parseStartupPerformanceReport(text);
            void closeDocument(doc);
            finish(timings);
            return true;
        };

        const disposable = vscode.workspace.onDidOpenTextDocument(tryCapture);

        vscode.commands.executeCommand('perfview.show').then(() => {
            const existing = vscode.workspace.textDocuments.find((doc) => doc.uri.scheme === 'perf');
            if (existing) {
                tryCapture(existing);
            }
        }, (error: unknown) => {
            void vscode.window.showErrorMessage(`Failed to run "Developer: Startup Performance": ${String(error)}`);
            finish(undefined);
        });
        setTimeout(() => {
            if (!settled) {
                void vscode.window.showWarningMessage(
                    'Extensions Grid: no startup performance report was captured (timed out after 5s).'
                );
            }
            finish(undefined);
        }, 5000);
    });
}

async function closeDocument(doc: vscode.TextDocument): Promise<void> {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === doc.uri.toString()) {
                await vscode.window.tabGroups.close(tab);
                return;
            }
        }
    }
}

function parseStartupPerformanceReport(text: string): Map<string, StartupTiming> {
    const timings = new Map<string, StartupTiming>();
    const lines = text.split('\n');
    const headerIndex = lines.findIndex((line) => line.includes('Extension Activation Stats'));
    if (headerIndex === -1) {
        return timings;
    }

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim().startsWith('|')) {
            if (line.trim() === '') {
                continue;
            }
            break;
        }
        const cells = line.split('|').map((cell) => cell.trim());
        const row = cells.slice(1, -1);
        if (row.length < 5) {
            continue;
        }
        const [id, , loadCode, callActivate, finishActivate] = row;
        if (id === 'Extension' || /^-+$/.test(id)) {
            continue;
        }
        const loadCodeMs = Number(loadCode);
        const callActivateMs = Number(callActivate);
        const finishActivateMs = Number(finishActivate);
        if (Number.isNaN(loadCodeMs) || Number.isNaN(callActivateMs) || Number.isNaN(finishActivateMs)) {
            continue;
        }
        timings.set(id.toLowerCase(), {
            loadCodeMs,
            callActivateMs,
            finishActivateMs,
            totalMs: loadCodeMs + callActivateMs + finishActivateMs
        });
    }
    return timings;
}
