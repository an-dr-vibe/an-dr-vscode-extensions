import { describe, expect, it, vi } from "vitest";

import { webviewBridgeFactory } from "@/extension/webviewBridge";

import { createWebviewStub } from "./__mocks__/vscode";

describe("webviewBridgeFactory", () => {
  it("mutes the watcher around a registered incoming message", async () => {
    const webview = createWebviewStub();
    const watcher = { mute: vi.fn(), unmute: vi.fn() };
    const bridge = webviewBridgeFactory(webview as never, watcher as never);
    const handler = vi.fn().mockResolvedValue(undefined);
    bridge.onMessage("selectRepo", handler);

    await webview.receiveMessage({ command: "selectRepo", repo: "/repo" });

    expect(handler).toHaveBeenCalledWith({ command: "selectRepo", repo: "/repo" });
    expect(watcher.mute).toHaveBeenCalledOnce();
    expect(watcher.unmute).toHaveBeenCalledOnce();
  });

  it("ignores an unregistered incoming message", async () => {
    const webview = createWebviewStub();
    const watcher = { mute: vi.fn(), unmute: vi.fn() };
    webviewBridgeFactory(webview as never, watcher as never);

    await webview.receiveMessage({ command: "selectRepo", repo: "/repo" });

    expect(watcher.mute).not.toHaveBeenCalled();
    expect(watcher.unmute).not.toHaveBeenCalled();
  });

  it("forwards outgoing messages to the webview", async () => {
    const webview = createWebviewStub();
    const watcher = { mute: vi.fn(), unmute: vi.fn() };
    const bridge = webviewBridgeFactory(webview as never, watcher as never);
    const message = { command: "refresh" } as const;

    await expect(bridge.post(message)).resolves.toBe(true);
    expect(webview.postedMessages).toEqual([message]);
  });
});
