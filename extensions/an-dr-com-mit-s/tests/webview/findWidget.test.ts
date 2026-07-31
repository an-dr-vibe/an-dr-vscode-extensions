import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FindWidget } from "@/webview/findWidget";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

let widget: FindWidget;

function input(): HTMLInputElement {
  return document.getElementById("findInput") as HTMLInputElement;
}

function typeQuery(value: string) {
  input().value = value;
  input().dispatchEvent(new Event("input"));
}

describe("FindWidget", () => {
  beforeAll(() => {
    setupHtml(viewStateFixture());
    widget = new FindWidget(document.getElementById("commitTable")!);
  });

  beforeEach(() => {
    widget.close();
    document.getElementById("commitTable")!.innerHTML = `
      <table>
        <tbody>
          <tr class="commit" data-hash="a" data-find-text="Add toolbar Alice alice@example.com"><td>Toolbar</td></tr>
          <tr class="commit filterHidden" data-hash="b" data-find-text="Hidden Alice"><td>Hidden</td></tr>
          <tr class="commit" data-hash="c" data-find-text="Fix toolbar Bob"><td>Toolbar fix</td></tr>
        </tbody>
      </table>`;
  });

  it("opens from the toolbar and Ctrl/Cmd+F", () => {
    document.getElementById("findBtn")!.click();
    expect(document.getElementById("findWidget")!.getAttribute("aria-hidden")).toBe("false");
    expect(document.activeElement).toBe(input());

    widget.close();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }));
    expect(document.getElementById("findWidget")!.classList.contains("active")).toBe(true);
  });

  it("gives the symbol buttons localized accessible names", () => {
    expect(document.getElementById("findPreviousBtn")!.getAttribute("aria-label")).toBe(
      "Previous Match"
    );
    expect(document.getElementById("findNextBtn")!.getAttribute("aria-label")).toBe("Next Match");
    expect(document.getElementById("findCloseBtn")!.getAttribute("aria-label")).toBe("Close");
  });

  it("highlights visible case-insensitive matches and selects the first", () => {
    widget.open();
    typeQuery("TOOLBAR");

    const matches = document.querySelectorAll("tr.findMatch");
    expect(matches).toHaveLength(2);
    expect(document.querySelector("tr[data-hash='a']")!.classList).toContain("findCurrentMatch");
    expect(document.getElementById("findMatchCount")!.textContent).toBe("1 of 2");
  });

  it("navigates next, previous, and wraps around", () => {
    widget.open();
    typeQuery("toolbar");

    document.getElementById("findNextBtn")!.click();
    expect(document.querySelector("tr[data-hash='c']")!.classList).toContain("findCurrentMatch");
    document.getElementById("findNextBtn")!.click();
    expect(document.querySelector("tr[data-hash='a']")!.classList).toContain("findCurrentMatch");
    document.getElementById("findPreviousBtn")!.click();
    expect(document.querySelector("tr[data-hash='c']")!.classList).toContain("findCurrentMatch");
  });

  it("uses Enter and Shift+Enter for navigation", () => {
    widget.open();
    typeQuery("toolbar");

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(document.querySelector("tr[data-hash='c']")!.classList).toContain("findCurrentMatch");
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
    expect(document.querySelector("tr[data-hash='a']")!.classList).toContain("findCurrentMatch");
  });

  it("reapplies a query after rows are replaced and retains the current hash", () => {
    widget.open();
    typeQuery("toolbar");
    document.getElementById("findNextBtn")!.click();

    document
      .querySelector("#commitTable tbody")!
      .insertAdjacentHTML(
        "beforeend",
        '<tr class="commit" data-hash="d" data-find-text="Toolbar docs"><td>Docs</td></tr>'
      );
    widget.refresh();

    expect(document.querySelector("tr[data-hash='c']")!.classList).toContain("findCurrentMatch");
    expect(document.querySelectorAll("tr.findMatch")).toHaveLength(3);
    expect(document.getElementById("findMatchCount")!.textContent).toBe("2 of 3");
  });

  it("closes with Escape and clears all highlights", () => {
    widget.open();
    typeQuery("toolbar");
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.getElementById("findWidget")!.getAttribute("aria-hidden")).toBe("true");
    expect(input().value).toBe("");
    expect(document.querySelectorAll("tr.findMatch, tr.findCurrentMatch")).toHaveLength(0);
  });
});
