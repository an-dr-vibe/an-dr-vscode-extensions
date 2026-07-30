import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerMessageHandlers } from "@/extension/messageHandler";
import type { RequestMessage, ResponseMessage } from "@/types";

const utilityMocks = vi.hoisted(() => ({
  archive: vi.fn(),
  getRelativeTimeDiff: vi.fn(),
  openExtensionSettings: vi.fn(),
  openExternalUrl: vi.fn(),
  openFile: vi.fn(),
  viewFileAtRevision: vi.fn(),
  viewScm: vi.fn(),
  viewSubmoduleDiff: vi.fn()
}));

vi.mock("@/utils", () => utilityMocks);

function createHarness() {
  const handlers = new Map<string, (message: RequestMessage) => void | Promise<void>>();
  const post = vi.fn<(message: ResponseMessage) => void>();
  const bridge = {
    onMessage: (command: string, handler: (message: RequestMessage) => void | Promise<void>) => {
      handlers.set(command, handler);
    },
    post
  };
  const gitStatusMonitor = { selectRepo: vi.fn() };
  const gitClient = { setRepo: vi.fn() };
  const repoFileWatcher = { start: vi.fn() };
  registerMessageHandlers(bridge as never, {
    config: {} as never,
    gitClient: gitClient as never,
    dataSource: {} as never,
    gitStatusMonitor: gitStatusMonitor as never,
    repoManager: {} as never,
    extensionState: {} as never,
    avatarManager: {} as never,
    repoFileWatcher: repoFileWatcher as never
  });
  return { gitStatusMonitor, handlers, post };
}

describe("registerMessageHandlers utility actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes external URLs through the extension utility and posts the result", async () => {
    utilityMocks.openExternalUrl.mockResolvedValue("blocked");
    const { handlers, post } = createHarness();

    await handlers.get("openExternalUrl")!({
      command: "openExternalUrl",
      url: "https://example.test",
      type: "documentation"
    });

    expect(utilityMocks.openExternalUrl).toHaveBeenCalledWith(
      "https://example.test",
      "documentation"
    );
    expect(post).toHaveBeenCalledWith({
      command: "openExternalUrl",
      error: "blocked"
    });
  });

  it("formats relative time through the same live message surface", async () => {
    utilityMocks.getRelativeTimeDiff.mockReturnValue("3 minutes ago");
    const { handlers, post } = createHarness();

    await handlers.get("getRelativeTimeDiff")!({
      command: "getRelativeTimeDiff",
      unixTimestamp: 1_000
    });

    expect(utilityMocks.getRelativeTimeDiff).toHaveBeenCalledWith(1_000);
    expect(post).toHaveBeenCalledWith({
      command: "getRelativeTimeDiff",
      value: "3 minutes ago"
    });
  });

  it("publishes repository selection to the status monitor", async () => {
    const { gitStatusMonitor, handlers } = createHarness();

    await handlers.get("selectRepo")!({
      command: "selectRepo",
      repo: "C:/repo"
    });

    expect(gitStatusMonitor.selectRepo).toHaveBeenCalledWith("C:/repo");
  });
});
