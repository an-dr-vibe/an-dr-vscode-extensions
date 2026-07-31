import { DEFAULT_FILES_PANEL_WIDTH, FilesPanel } from "@an-dr/commits-core/webview/filesPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

function widthVar(name: string): string {
  return document.body.style.getPropertyValue(name);
}

function drag(from: number, to: number) {
  const handle = document.getElementById("filesPanelResizeHandle")!;
  handle.dispatchEvent(new MouseEvent("mousedown", { clientX: from, cancelable: true }));
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: to }));
  document.dispatchEvent(new MouseEvent("mouseup"));
}

describe("files panel", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  it("starts hidden, reserving no width", () => {
    // Nothing is selected on load, so an open panel would only take space
    // away from the commit table.
    const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);

    expect(panel.isHidden()).toBe(true);
    expect(document.body.classList.contains("filesPanelHidden")).toBe(true);
    expect(widthVar("--files-panel-width")).toBe("0px");
    expect(widthVar("--files-panel-inline-width")).toBe("280px");
  });

  it("reserves its width once shown", () => {
    const panel = new FilesPanel(320);
    panel.show();

    expect(panel.isHidden()).toBe(false);
    expect(document.body.classList.contains("filesPanelHidden")).toBe(false);
    expect(widthVar("--files-panel-width")).toBe("320px");
  });

  it("keeps its own width while hidden so it reopens as it was", () => {
    const panel = new FilesPanel(320);
    panel.show();
    panel.hide();

    expect(widthVar("--files-panel-width")).toBe("0px");
    expect(widthVar("--files-panel-inline-width")).toBe("320px");

    panel.show();
    expect(widthVar("--files-panel-width")).toBe("320px");
  });

  it("toggles between shown and hidden", () => {
    const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
    panel.toggle();
    expect(panel.isHidden()).toBe(false);
    panel.toggle();
    expect(panel.isHidden()).toBe(true);
  });

  it("ignores a redundant show or hide", () => {
    const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
    expect(() => panel.hide()).not.toThrow();
    expect(panel.isHidden()).toBe(true);

    panel.show();
    panel.show();
    expect(panel.isHidden()).toBe(false);
  });

  describe("resizing", () => {
    it("widens as the left edge is dragged left", () => {
      const panel = new FilesPanel(300);
      panel.show();

      drag(500, 450);

      expect(panel.getWidth()).toBe(350);
      expect(widthVar("--files-panel-width")).toBe("350px");
    });

    it("reports the new width only when the drag ends", () => {
      // Persisting on every mousemove would write state continuously while
      // the user is still dragging.
      const onWidthChange = vi.fn();
      const panel = new FilesPanel(300, onWidthChange);
      panel.show();

      const handle = document.getElementById("filesPanelResizeHandle")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 500, cancelable: true }));
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 450 }));
      expect(onWidthChange).not.toHaveBeenCalled();

      document.dispatchEvent(new MouseEvent("mouseup"));
      expect(onWidthChange).toHaveBeenCalledWith(350);
    });

    it("clamps to the allowed range", () => {
      const panel = new FilesPanel(300);
      panel.show();

      drag(500, 900);
      expect(panel.getWidth()).toBe(140);

      drag(500, 0);
      expect(panel.getWidth()).toBe(600);
    });

    it("clamps a width restored from an older state", () => {
      expect(new FilesPanel(5000).getWidth()).toBe(600);
      expect(new FilesPanel(1).getWidth()).toBe(140);
    });

    it("stops resizing after the drag ends", () => {
      const panel = new FilesPanel(300);
      drag(500, 450);
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));

      expect(panel.getWidth()).toBe(350);
    });
  });

  describe("content", () => {
    it("shows a placeholder until a commit is selected", () => {
      const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
      const content = panel.getContentElem();

      expect(content.querySelector(".filesPanelPlaceholder")).not.toBeNull();
    });

    it("replaces the placeholder with the file list", () => {
      const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
      panel.setContent('<div class="gitFile">src/main.ts</div>');

      const content = document.getElementById("filesPanelContent")!;
      expect(content.querySelector(".gitFile")).not.toBeNull();
      expect(content.querySelector(".filesPanelPlaceholder")).toBeNull();
    });

    it("returns to the placeholder when cleared", () => {
      const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
      panel.setHeader("<b>Changed Files</b>");
      panel.setFooter("2 files");
      panel.setContent('<div class="gitFile">src/main.ts</div>');

      panel.clear();

      const content = document.getElementById("filesPanelContent")!;
      expect(content.querySelector(".filesPanelPlaceholder")).not.toBeNull();
      expect(document.getElementById("filesPanelHeader")!.innerHTML).toBe("");
      expect(document.getElementById("filesPanelFooter")!.innerHTML).toBe("");
    });

    it("restores the scroll position across a content update", () => {
      // Re-rendering the same commit's files must not jump the user back to
      // the top of a long change list.
      const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
      const content = panel.getContentElem();
      content.scrollTop = 40;
      content.dispatchEvent(new Event("scroll"));

      panel.setContent('<div class="gitFile">src/main.ts</div>');

      expect(content.scrollTop).toBe(40);
    });

    it("resets the scroll position when cleared", () => {
      const panel = new FilesPanel(DEFAULT_FILES_PANEL_WIDTH);
      const content = panel.getContentElem();
      content.scrollTop = 40;
      content.dispatchEvent(new Event("scroll"));

      panel.clear();
      panel.setContent('<div class="gitFile">src/main.ts</div>');

      expect(content.scrollTop).toBe(0);
    });
  });
});
