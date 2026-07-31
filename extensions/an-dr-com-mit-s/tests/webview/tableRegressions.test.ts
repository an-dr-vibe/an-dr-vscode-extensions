import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards against three regressions the 2.0 table layout introduced, each of
 * which is invisible to a DOM test because jsdom applies no stylesheet: the
 * assertions read the stylesheet itself.
 */
const css = fs.readFileSync(path.join(__dirname, "..", "..", "media", "main.css"), "utf8");

function ruleFor(selector: string): string {
  const start = css.indexOf(selector + " {");
  expect(start, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("commit table stylesheet", () => {
  it("keeps the graph above the view background", () => {
    // #view paints an opaque background, so a negative z-index would hide the
    // graph entirely rather than layering it behind the rows.
    const rule = ruleFor("#commitGraph");
    expect(rule).toContain("z-index: 2");
    expect(rule).not.toContain("z-index: -1");
    // Raising it must not let the SVG swallow clicks meant for the rows.
    expect(rule).toContain("pointer-events: none");
  });

  it("sizes avatars for every table row, not only commit rows", () => {
    // The uncommitted row is .unsavedChanges, so a .commit-scoped rule left its
    // image unsized and it rendered at its natural size.
    expect(css).toContain("#commitTable .avatar.normal {");
    expect(css).not.toContain(".commit .avatar.normal {");
  });

  it("lets the message cell absorb the spare width", () => {
    const rule = ruleFor("#commitTable td:first-child");
    expect(rule).toContain("width: 100%");
    // Without max-width:0 the cell sizes to its content and pushes the trailing
    // columns off the right edge.
    expect(rule).toContain("max-width: 0");
  });

  it("caps the Dev column so the ID column stays on screen", () => {
    expect(css).toContain("max-width: 190px");
  });

  it("targets the merged cell by position, not by the old column index", () => {
    // A row is now [merged graph/message, Dev, ID], so td:nth-child(2) is the
    // Dev cell. Rules meant for the message must say td:first-child.
    expect(css).toContain("#commitTable tr.commit.head td:first-child {");
    expect(css).not.toContain("#commitTable td:nth-child(2) {");
    expect(css).not.toContain("#commitTable tr.commit.head td:nth-child(2) {");
  });
});
