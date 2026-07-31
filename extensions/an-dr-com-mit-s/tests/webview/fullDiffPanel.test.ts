import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FULL_DIFF_HEIGHT, FullDiffPanel } from "@/webview/fullDiffPanel";
import {
  buildUnifiedRows,
  parseUnifiedDiffHunks,
  renderFullDiff,
  toDisplayLines
} from "@/webview/fullDiffRender";

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

  it("escapes file content so a file cannot inject markup", () => {
    const html = renderFullDiff({
      diff: "@@ -1,1 +1,1 @@\n-<b>x</b>\n+<img src=x onerror=y>\n",
      oldContent: "<b>x</b>\n",
      newContent: "<img src=x onerror=y>\n",
      oldExists: true,
      newExists: true
    });

    expect(html).not.toContain("<img src");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img src=x onerror=y&gt;");
  });

  it("reports a localized message when there is nothing to render", () => {
    expect(renderFullDiff(null)).toContain(l10n.fullDiffUnableToLoad);
    expect(
      renderFullDiff({
        diff: null,
        oldContent: null,
        newContent: null,
        oldExists: false,
        newExists: false
      })
    ).toContain(l10n.fullDiffUnableToLoad);
    expect(
      renderFullDiff({
        diff: "",
        oldContent: null,
        newContent: null,
        oldExists: false,
        newExists: false
      })
    ).toContain(l10n.fullDiffNoChanges);
  });
});

describe("FullDiffPanel", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  it("starts closed and reserves no height", () => {
    const panel = new FullDiffPanel(undefined);

    expect(panel.isHidden()).toBe(true);
    expect(panel.getState()).toEqual({ height: DEFAULT_FULL_DIFF_HEIGHT });
    expect(document.body.style.getPropertyValue("--full-diff-height")).toBe("0px");
  });

  it("restores a saved height and reserves it once opened", () => {
    const changed = vi.fn();
    const panel = new FullDiffPanel({ height: 300 }, changed);

    panel.open("src/a.ts");

    expect(panel.isHidden()).toBe(false);
    expect(document.getElementById("fullDiffFilename")!.textContent).toBe("src/a.ts");
    expect(document.body.style.getPropertyValue("--full-diff-height")).toBe("300px");
    expect(changed).toHaveBeenCalledWith({ height: 300 });
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
    const data = {
      diff: DIFF,
      oldContent: OLD,
      newContent: NEW,
      oldExists: true,
      newExists: true
    };

    panel.render(data);
    expect(document.getElementById("fullDiffContent")!.innerHTML).toBe("");

    panel.open("f.txt");
    panel.render(data);
    expect(document.querySelectorAll("#fullDiffContent .diffRow")).toHaveLength(6);
    expect(document.querySelectorAll("#fullDiffContent .diffChanged")).toHaveLength(2);
  });
});
