import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hideContextMenu,
  hideContextMenuIfOpen,
  isContextMenuOpen,
  showContextMenu
} from "@/webview/contextMenu";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

function menuElem(): HTMLElement {
  return document.getElementById("contextMenu")!;
}

function openAt(x: number, y: number, items: ContextMenuElement[]) {
  const source = document.getElementById("refreshBtn")!;
  const event = new MouseEvent("contextmenu", { cancelable: true });
  Object.defineProperty(event, "pageX", { value: x });
  Object.defineProperty(event, "pageY", { value: y });
  showContextMenu(event, items, source);
  return { event, source };
}

describe("context menu", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
    hideContextMenu();
  });

  it("renders items and dividers", () => {
    openAt(10, 10, [
      { title: "Checkout", onClick: () => {} },
      null,
      { title: "Delete", onClick: () => {} }
    ]);

    expect(isContextMenuOpen()).toBe(true);
    expect(menuElem().querySelectorAll(".contextMenuItem")).toHaveLength(2);
    expect(menuElem().querySelectorAll(".contextMenuDivider")).toHaveLength(1);
  });

  it("runs the clicked item's action and closes", () => {
    const checkout = vi.fn();
    const remove = vi.fn();
    openAt(10, 10, [
      { title: "Checkout", onClick: checkout },
      { title: "Delete", onClick: remove }
    ]);

    menuElem()
      .querySelectorAll<HTMLElement>(".contextMenuItem")[1]
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(remove).toHaveBeenCalledOnce();
    expect(checkout).not.toHaveBeenCalled();
    expect(isContextMenuOpen()).toBe(false);
  });

  it("suppresses the host's native menu", () => {
    // Required in browser-based VS Code, where the native menu would otherwise
    // render on top of this one.
    const { event } = openAt(10, 10, [{ title: "Checkout", onClick: () => {} }]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("marks and unmarks the element it was opened from", () => {
    const { source } = openAt(10, 10, [{ title: "Checkout", onClick: () => {} }]);
    expect(source.classList.contains("contextMenuActive")).toBe(true);

    hideContextMenu();
    expect(source.classList.contains("contextMenuActive")).toBe(false);
  });

  it("clears its position when closed so it cannot reopen off-screen", () => {
    openAt(120, 90, [{ title: "Checkout", onClick: () => {} }]);
    hideContextMenu();

    expect(menuElem().style.left).toBe("0px");
    expect(menuElem().style.top).toBe("0px");
    expect(menuElem().innerHTML).toBe("");
  });

  it("closes an already-open menu when a second one opens", () => {
    openAt(10, 10, [{ title: "First", onClick: () => {} }]);
    const first = document.getElementById("refreshBtn")!;
    const second = document.getElementById("pushBtn")!;

    const event = new MouseEvent("contextmenu", { cancelable: true });
    Object.defineProperty(event, "pageX", { value: 40 });
    Object.defineProperty(event, "pageY", { value: 40 });
    showContextMenu(event, [{ title: "Second", onClick: () => {} }], second);

    expect(first.classList.contains("contextMenuActive")).toBe(false);
    expect(second.classList.contains("contextMenuActive")).toBe(true);
    expect(menuElem().querySelectorAll(".contextMenuItem")).toHaveLength(1);
  });

  it("does nothing when asked to close while already closed", () => {
    expect(isContextMenuOpen()).toBe(false);
    expect(() => hideContextMenuIfOpen()).not.toThrow();
  });
});
