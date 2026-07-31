import { escapeHtml } from "./utils/html";

export interface FullDiffData {
  diff: string | null;
  oldContent: string | null;
  newContent: string | null;
  oldExists: boolean;
  newExists: boolean;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: string[];
}

export type DiffRowKind = "context" | "removed" | "added";

export interface DiffRow {
  kind: DiffRowKind;
  oldNum: string;
  newNum: string;
  content: string;
  changed: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const NO_NEWLINE = "\\ No newline at end of file";

/** Splits file text into display lines, tolerating either line ending. */
export function toDisplayLines(content: string | null): string[] {
  if (content === null) {
    return [];
  }
  const normalized = content.replace(/\r\n?/g, "\n");
  if (normalized === "") {
    return [];
  }
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** Reads the hunk headers and bodies out of a unified diff. */
export function parseUnifiedDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  for (const line of diff.replace(/\r\n?/g, "\n").split("\n")) {
    const match = HUNK_HEADER.exec(line);
    if (match !== null) {
      // A zero line count means the hunk adds or removes nothing on that side,
      // and the header then names the line *before* the change rather than the
      // first line of it.
      current = {
        oldStart: parseInt(match[1]) + (match[2] === "0" ? 1 : 0),
        newStart: parseInt(match[3]) + (match[4] === "0" ? 1 : 0),
        lines: []
      };
      hunks.push(current);
      continue;
    }
    if (
      current !== null &&
      (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === NO_NEWLINE)
    ) {
      current.lines.push(line);
    }
  }
  return hunks;
}

/**
 * Rebuilds the whole file as numbered rows, using the hunks only to decide
 * which lines changed. The diff alone carries a few lines of context, so the
 * full text of both endpoints is what makes the unchanged remainder visible.
 */
export function buildUnifiedRows(
  oldLines: readonly string[],
  newLines: readonly string[],
  hunks: readonly DiffHunk[]
): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNum = 1;
  let newNum = 1;

  const pushContext = () => {
    rows.push({
      kind: "context",
      oldNum: String(oldNum),
      newNum: String(newNum),
      content: newLines[newNum - 1] ?? oldLines[oldNum - 1] ?? "",
      changed: false
    });
    oldNum++;
    newNum++;
  };

  for (const hunk of hunks) {
    while (oldNum < hunk.oldStart && newNum < hunk.newStart) {
      pushContext();
    }
    for (const line of hunk.lines) {
      if (line === NO_NEWLINE) {
        continue;
      }
      if (line.startsWith(" ")) {
        pushContext();
      } else if (line.startsWith("-")) {
        rows.push({
          kind: "removed",
          oldNum: String(oldNum),
          newNum: "",
          content: oldLines[oldNum++ - 1] ?? line.slice(1),
          changed: true
        });
      } else {
        rows.push({
          kind: "added",
          oldNum: "",
          newNum: String(newNum),
          content: newLines[newNum++ - 1] ?? line.slice(1),
          changed: true
        });
      }
    }
  }
  while (oldNum <= oldLines.length && newNum <= newLines.length) {
    pushContext();
  }
  return rows;
}

/** Renders the unified rows as the panel's line grid. */
export function renderUnifiedView(rows: readonly DiffRow[]): string {
  let html = '<div class="diffFullView">';
  for (const row of rows) {
    const classes = row.changed
      ? `diffRow diffChanged diff${row.kind === "added" ? "Added" : "Removed"}`
      : "diffRow diffContext";
    html +=
      `<div class="${classes}"><span class="diffLnOld">${row.oldNum}</span>` +
      `<span class="diffLnNew">${row.newNum}</span><span class="diffLnSep">│</span>` +
      `<span class="diffRowContent">${escapeHtml(row.content)}</span></div>`;
  }
  return html + "</div>";
}

/** Builds the panel body for one file, or a message when there is nothing to show. */
export function renderFullDiff(data: FullDiffData | null): string {
  if (data === null || data.diff === null) {
    return `<div class="fullDiffMessage">${escapeHtml(l10n.fullDiffUnableToLoad)}</div>`;
  }
  const rows = buildUnifiedRows(
    toDisplayLines(data.oldExists ? data.oldContent : null),
    toDisplayLines(data.newExists ? data.newContent : null),
    parseUnifiedDiffHunks(data.diff)
  );
  if (rows.length === 0) {
    return `<div class="fullDiffMessage">${escapeHtml(l10n.fullDiffNoChanges)}</div>`;
  }
  return renderUnifiedView(rows);
}
