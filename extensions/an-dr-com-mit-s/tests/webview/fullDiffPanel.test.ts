import { DEFAULT_FULL_DIFF_HEIGHT, FullDiffPanel } from "@an-dr/commits-core/webview/fullDiffPanel";
import {
  buildUnifiedRows,
  compactRows,
  pairSideBySideRows,
  parseUnifiedDiffHunks,
  renderFullDiff,
  toDisplayLines
} from "@an-dr/commits-core/webview/fullDiffRender";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewStateFixture } from "./fixtures";
import { setupHtml, setupL10n } from "./setup";

const DIFF = [
  "diff --git a/f.txt b/f.txt",
  "index 111..222 100644",
  "--- a/f.txt",
  "+++ b/f.txt",
  "@@ -2,3 +2,3 @@",
  " b",
  "-c",
  "+C",
  " d",
  ""
].join("\n");

const OLD = "a\nb\nc\nd\ne\n";
const NEW = "a\nb\nC\nd\ne\n";

/** A run of unchanged rows with a single changed row at the given index. */
function runWithChangeAt(changedAt: number, length: number) {
  return Array.from({ length }, (_unused, i) => ({ changed: i === changedAt }));
}

describe("fullDiffRender", () => {
  beforeEach(() => {
    setupL10n();
  });

  it("splits file text on either line ending and drops the trailing blank", () => {
    expect(toDisplayLines("a\r\nb\rc\n")).toEqual(["a", "b", "c"]);
    expect(toDisplayLines("")).toEqual([]);
    expect(toDisplayLines(null)).toEqual([]);
  });

  it("reads hunk headers and bodies out of a unified diff", () => {
    expect(parseUnifiedDiffHunks(DIFF)).toEqual([
      { oldStart: 2, newStart: 2, lines: [" b", "-c", "+C", " d"] }
    ]);
  });

  it("rebuilds the whole file, marking only the changed lines", () => {
    const rows = buildUnifiedRows(
      toDisplayLines(OLD),
      toDisplayLines(NEW),
      parseUnifiedDiffHunks(DIFF)
    );

    expect(rows.map((row) => `${row.oldNum}|${row.newNum}|${row.content}`)).toEqual([
      "1|1|a",
      "2|2|b",
      "3||c",
      "|3|C",
      "4|4|d",
      "5|5|e"
    ]);
    expect(rows.filter((row) => row.changed).map((row) => row.kind)).toEqual(["removed", "added"]);
  });

  it("treats a zero-length side as an insertion point, not a first line", () => {
    const addOnly = ["@@ -1,0 +2,1 @@", "+two", ""].join("\n");

    expect(parseUnifiedDiffHunks(addOnly)[0]).toMatchObject({ oldStart: 2, newStart: 2 });
    const rows = buildUnifiedRows(
      toDisplayLines("one\n"),
      toDisplayLines("one\ntwo\n"),
      parseUnifiedDiffHunks(addOnly)
    );

    expect(rows.map((row) => [row.oldNum, row.newNum])).toEqual([
      ["1", "1"],
      ["", "2"]
    ]);
  });

  it("pairs each run of removals against the additions that follow it", () => {
    const rows = buildUnifiedRows(
      toDisplayLines(OLD),
      toDisplayLines(NEW),
      parseUnifiedDiffHunks(DIFF)
    );

    expect(
      pairSideBySideRows(rows).map((row) => [row.left?.content ?? null, row.right?.content ?? null])
    ).toEqual([
      ["a", "a"],
      ["b", "b"],
      ["c", "C"],
      ["d", "d"],
      ["e", "e"]
    ]);
  });

  it("leaves a side empty where the other has no counterpart", () => {
    const paired = pairSideBySideRows([
      { kind: "removed", oldNum: "1", newNum: "", content: "gone", changed: true },
      { kind: "added", oldNum: "", newNum: "1", content: "new", changed: true },
      { kind: "added", oldNum: "", newNum: "2", content: "extra", changed: true }
    ]);

    expect(paired.map((row) => [row.left?.content ?? null, row.right?.content ?? null])).toEqual([
      ["gone", "new"],
      [null, "extra"]
    ]);
  });

  it("folds only unchanged runs longer than the kept context", () => {
    // Four kept lines per run, so a run of four is left whole.
    expect(compactRows(runWithChangeAt(4, 9), true)).toHaveLength(9);
    expect(compactRows(runWithChangeAt(6, 12), false)).toHaveLength(12);

    // Runs of six and five fold to two kept lines on each side of a spacer.
    expect(compactRows(runWithChangeAt(6, 12), true)).toEqual([
      { changed: false },
      { changed: false },
      { spacer: 2 },
      { changed: false },
      { changed: false },
      { changed: true },
      { changed: false },
      { changed: false },
      { spacer: 1 },
      { changed: false },
      { changed: false }
    ]);
  });

  it("escapes file content so a file cannot inject markup", () => {
    const html = renderFullDiff(
      {
        diff: "@@ -1,1 +1,1 @@\n-<b>x</b>\n+<img src=x onerror=y>\n",
        oldContent: "<b>x</b>\n",
        newContent: "<img src=x onerror=y>\n",
        oldExists: true,
        newExists: true
      },
      { mode: "unified", compact: false }
    );

    expect(html).not.toContain("<img src");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img src=x onerror=y&gt;");
  });

  it("escapes raw diff output too", () => {
    const html = renderFullDiff(
      {
        diff: "@@ -1,1 +1,1 @@\n+<img src=x>\n",
        oldContent: null,
        newContent: null,
        oldExists: false,
        newExists: false
      },
      { mode: "raw", compact: false }
    );

    expect(html).not.toContain("<img src");
    expect(html).toContain("diffHunkHeader");
  });

  it("reports a localized message when there is nothing to render", () => {
    const options = { mode: "unified", compact: false } as const;
    expect(renderFullDiff(null, options)).toContain(l10n.fullDiffUnableToLoad);
    expect(
      renderFullDiff(
        {
          diff: null,
          oldContent: null,
          newContent: null,
          oldExists: false,
          newExists: false
        },
        options
      )
    ).toContain(l10n.fullDiffUnableToLoad);
    expect(
      renderFullDiff(
        {
          diff: "",
          oldContent: null,
          newContent: null,
          oldExists: false,
          newExists: false
        },
        options
      )
    ).toContain(l10n.fullDiffNoChanges);
  });
});

describe("FullDiffPanel", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  const DATA = {
    diff: DIFF,
    oldContent: OLD,
    newContent: NEW,
    oldExists: true,
    newExists: true
  };

  it("starts closed and reserves no height", () => {
    const panel = new FullDiffPanel(undefined);

    expect(panel.isHidden()).toBe(true);
    expect(panel.getState()).toEqual({
      height: DEFAULT_FULL_DIFF_HEIGHT,
      mode: "unified",
      compact: false
    });
    expect(document.body.style.getPropertyValue("--full-diff-height")).toBe("0px");
  });

  it("restores a saved height and reserves it once opened", () => {
    const changed = vi.fn();
    const panel = new FullDiffPanel({ height: 300, mode: "raw", compact: true }, changed);

    panel.open("src/a.ts");

    expect(panel.isHidden()).toBe(false);
    expect(document.getElementById("fullDiffFilename")!.textContent).toBe("src/a.ts");
    expect(document.body.style.getPropertyValue("--full-diff-height")).toBe("300px");
    expect(changed).toHaveBeenCalledWith({ height: 300, mode: "raw", compact: true });
    expect(document.getElementById("fullDiffMode-raw")!.classList.contains("active")).toBe(true);
  });

  it("falls back to the unified mode when the saved mode is not recognised", () => {
    const panel = new FullDiffPanel({ mode: "bogus" as never });

    expect(panel.getState().mode).toBe("unified");
    expect(document.getElementById("fullDiffMode-unified")!.classList.contains("active")).toBe(
      true
    );
  });

  it("switches view mode from the header and redraws the file it already holds", () => {
    const changed = vi.fn();
    const panel = new FullDiffPanel(undefined, changed);
    panel.open("f.txt");
    panel.render(DATA);

    document.getElementById("fullDiffMode-sideBySide")!.click();

    expect(panel.getState().mode).toBe("sideBySide");
    expect(document.querySelectorAll("#fullDiffContent .diffSbsPane")).toHaveLength(2);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "sideBySide" }));
  });

  it("toggles compact mode and folds the unchanged run", () => {
    const long = Array.from({ length: 12 }, (_unused, i) => `line ${i}`).join("\n") + "\n";
    const changedLong = long.replace("line 0", "LINE 0");
    const panel = new FullDiffPanel(undefined);
    panel.open("f.txt");
    panel.render({
      diff: "@@ -1,1 +1,1 @@\n-line 0\n+LINE 0\n",
      oldContent: long,
      newContent: changedLong,
      oldExists: true,
      newExists: true
    });
    expect(document.querySelectorAll("#fullDiffContent .diffSpacer")).toHaveLength(0);

    document.getElementById("fullDiffCompactBtn")!.click();

    expect(panel.getState().compact).toBe(true);
    expect(document.querySelectorAll("#fullDiffContent .diffSpacer")).toHaveLength(1);
  });

  it("counts changed blocks rather than changed lines", () => {
    const panel = new FullDiffPanel(undefined);
    panel.open("f.txt");
    panel.render(DATA);

    // One removal immediately followed by one addition is a single block.
    expect(document.getElementById("fullDiffChangeCounter")!.textContent).toBe("1 / 1");

    panel.close();
    expect(document.getElementById("fullDiffChangeCounter")!.textContent).toBe("0 / 0");
  });

  it("closes from the header button and releases the reserved height", () => {
    const panel = new FullDiffPanel(undefined);
    panel.open("src/a.ts");

    document.getElementById("fullDiffCloseBtn")!.click();

    expect(panel.isHidden()).toBe(true);
    expect(document.body.style.getPropertyValue("--full-diff-height")).toBe("0px");
    expect(document.getElementById("fullDiffContent")!.innerHTML).toBe("");
  });

  it("renders the file only while open", () => {
    const panel = new FullDiffPanel(undefined);

    panel.render(DATA);
    expect(document.getElementById("fullDiffContent")!.innerHTML).toBe("");

    panel.open("f.txt");
    panel.render(DATA);
    expect(document.querySelectorAll("#fullDiffContent .diffRow")).toHaveLength(6);
    expect(document.querySelectorAll("#fullDiffContent .diffChanged")).toHaveLength(2);
  });
});
