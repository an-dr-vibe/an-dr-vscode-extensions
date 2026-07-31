import { describe, expect, it } from "vitest";

import { CommitSelection, readSelectionGesture } from "@/webview/commitSelection";

/** Table order runs newest-first, which is what makes index 2 older than 0. */
const HASHES = ["aaa", "bbb", "ccc", "ddd"];

function gesture(init: Partial<MouseEventInit>): ReturnType<typeof readSelectionGesture> {
  return readSelectionGesture(new MouseEvent("click", init));
}

describe("readSelectionGesture", () => {
  it("reads the platform's selection modifiers", () => {
    expect(gesture({})).toBe("replace");
    expect(gesture({ ctrlKey: true })).toBe("toggle");
    expect(gesture({ metaKey: true })).toBe("toggle");
    expect(gesture({ shiftKey: true })).toBe("range");
  });

  it("lets Shift win over Ctrl, so a range is never mistaken for a toggle", () => {
    expect(gesture({ shiftKey: true, ctrlKey: true })).toBe("range");
  });
});

describe("CommitSelection", () => {
  it("replaces the selection on a plain click", () => {
    const selection = new CommitSelection();

    selection.apply("replace", 0, HASHES);
    selection.apply("replace", 2, HASHES);

    expect(selection.getSelected()).toEqual(["ccc"]);
  });

  it("adds and removes one commit on a toggle", () => {
    const selection = new CommitSelection();

    selection.apply("replace", 0, HASHES);
    selection.apply("toggle", 2, HASHES);
    expect(selection.getSelected()).toEqual(["aaa", "ccc"]);

    selection.apply("toggle", 2, HASHES);
    expect(selection.getSelected()).toEqual(["aaa"]);
  });

  it("extends from the last commit touched on a range", () => {
    const selection = new CommitSelection();

    selection.apply("replace", 1, HASHES);
    selection.apply("range", 3, HASHES);

    expect(selection.getSelected()).toEqual(["bbb", "ccc", "ddd"]);
  });

  it("extends backwards just as well", () => {
    const selection = new CommitSelection();

    selection.apply("replace", 3, HASHES);
    selection.apply("range", 1, HASHES);

    // Membership is what matters; the set keeps insertion order.
    expect(selection.getSelected().toSorted()).toEqual(["bbb", "ccc", "ddd"]);
  });

  it("treats a range with no anchor as picking that one commit", () => {
    const selection = new CommitSelection();

    selection.apply("range", 2, HASHES);

    expect(selection.getSelected()).toEqual(["ccc"]);
  });

  it("ignores a click on an index the table does not have", () => {
    const selection = new CommitSelection();

    selection.apply("replace", 99, HASHES);

    expect(selection.getSelected()).toEqual([]);
  });

  it("offers a comparison only once exactly two are selected", () => {
    const selection = new CommitSelection();

    selection.apply("replace", 0, HASHES);
    expect(selection.getComparison(HASHES)).toBeNull();

    selection.apply("toggle", 2, HASHES);
    expect(selection.getComparison(HASHES)).toEqual({ from: "ccc", to: "aaa" });

    selection.apply("toggle", 3, HASHES);
    expect(selection.getComparison(HASHES)).toBeNull();
  });

  it("orders the comparison oldest-first whichever was picked first", () => {
    const older = new CommitSelection();
    older.apply("replace", 2, HASHES);
    older.apply("toggle", 0, HASHES);

    // Picked newest-last, but the range still runs old -> new.
    expect(older.getComparison(HASHES)).toEqual({ from: "ccc", to: "aaa" });
  });

  it("reports no comparison when a selected commit has left the table", () => {
    const selection = new CommitSelection();
    selection.apply("replace", 0, HASHES);
    selection.apply("toggle", 2, HASHES);

    expect(selection.getComparison(["aaa", "bbb"])).toBeNull();
  });

  it("forgets the anchor when cleared", () => {
    const selection = new CommitSelection();
    selection.apply("replace", 0, HASHES);
    selection.clear();

    selection.apply("range", 2, HASHES);

    expect(selection.getSelected()).toEqual(["ccc"]);
    expect(selection.size()).toBe(1);
  });
});
