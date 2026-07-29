import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "@tests/webview/setup";

describe("observeExternalUrls", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  it("routes nested clicks on supported links to the extension host", async () => {
    const vscode = createVscodeMock();
    document.body.innerHTML =
      '<a href="https://example.test/docs"><span id="label">Documentation</span></a>';
    const { observeExternalUrls } = await import("@/webview/observers/urlEvents");
    const dispose = observeExternalUrls();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    document.getElementById("label")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(vscode.sentMessages).toEqual([
      { command: "openExternalUrl", url: "https://example.test/docs" }
    ]);
    dispose();
  });

  it("leaves unsupported protocols to the webview", async () => {
    const vscode = createVscodeMock();
    document.body.innerHTML = '<a id="link" href="command:unsafe">Unsupported</a>';
    const { observeExternalUrls } = await import("@/webview/observers/urlEvents");
    observeExternalUrls();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const link = document.getElementById("link")!;
    link.addEventListener("click", (click) => click.preventDefault());

    link.dispatchEvent(event);

    expect(vscode.sentMessages).toEqual([]);
  });
});
