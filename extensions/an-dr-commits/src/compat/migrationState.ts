import * as vscode from "vscode";

const migrationVersionKey = "compatibilityMigrationVersion";
const currentVersion = 1;

/** Tracks only the migration format, never imports opaque legacy state objects. */
export function readMigrationVersion(state: vscode.Memento): number {
  return state.get<number>(migrationVersionKey, 0);
}

/** Advances the migration marker after an independently authored reader succeeds. */
export function writeMigrationVersion(state: vscode.Memento): Thenable<void> {
  return state.update(migrationVersionKey, currentVersion);
}
