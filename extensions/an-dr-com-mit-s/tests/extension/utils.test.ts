import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  file: vi.fn((fsPath: string) => ({ fsPath })),
  openExternal: vi.fn(),
  openTextDocument: vi.fn(),
  parse: vi.fn((value: string) => ({ value })),
  showErrorMessage: vi.fn(),
  showSaveDialog: vi.fn(),
  showTextDocument: vi.fn(),
  stat: vi.fn()
}));

vi.mock("vscode", () => ({
  env: { language: "en", openExternal: mock.openExternal },
  Uri: { file: mock.file, parse: mock.parse },
  ViewColumn: { Active: 1 },
  l10n: {
    t: (message: string, ...values: unknown[]) =>
      message.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)]))
  },
  commands: { executeCommand: mock.executeCommand },
  window: {
    showErrorMessage: mock.showErrorMessage,
    showSaveDialog: mock.showSaveDialog,
    showTextDocument: mock.showTextDocument
  },
  workspace: {
    fs: { stat: mock.stat },
    openTextDocument: mock.openTextDocument
  }
}));

import {
  archive,
  getRelativeTimeDiff,
  getSortedRepositoryPaths,
  openExternalUrl,
  openFile,
  showErrorMessage,
  viewSubmoduleDiff
} from "@/utils";

describe("extension utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sorts repository paths deterministically", () => {
    expect(
      getSortedRepositoryPaths({
        "C:/work/zeta": { columnWidths: null },
        "C:/work/alpha": { columnWidths: null }
      })
    ).toEqual(["C:/work/alpha", "C:/work/zeta"]);
  });

  it("formats deterministic relative time with locale plural rules", () => {
    expect(getRelativeTimeDiff(1_000, 1_120, "en")).toBe("2 minutes ago");
  });

  it("reports a rejected external URL without throwing", async () => {
    mock.openExternal.mockResolvedValue(false);

    await expect(openExternalUrl("https://example.test")).resolves.toContain(
      "unable to open the external URL"
    );
  });

  it("rejects an unsupported archive extension before calling Git", async () => {
    mock.showSaveDialog.mockResolvedValue({ fsPath: "C:/out/repo.7z" });
    const dataSource = { archive: vi.fn() };

    await expect(archive("C:/repo", "main", dataSource as never)).resolves.toContain(
      ".tar or .zip"
    );
    expect(dataSource.archive).not.toHaveBeenCalled();
  });

  it("opens the current name of a file renamed since the selected revision", async () => {
    mock.stat.mockRejectedValueOnce(new Error("missing")).mockResolvedValueOnce({});
    mock.executeCommand.mockResolvedValue(undefined);
    const dataSource = {
      findRenamedPath: vi.fn().mockResolvedValue("src/renamed.ts")
    };

    await expect(
      openFile("C:/repo", "src/original.ts", "abc123", dataSource as never)
    ).resolves.toBeNull();
    expect(dataSource.findRenamedPath).toHaveBeenCalledWith("C:/repo", "abc123", "src/original.ts");
    expect(mock.executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({ fsPath: expect.stringMatching(/src[\\/]renamed\.ts$/) }),
      { preview: true, viewColumn: 1 }
    );
  });

  it("does not open an editor when a submodule diff cannot be read", async () => {
    const dataSource = { getSubmoduleDiff: vi.fn().mockResolvedValue(null) };

    await expect(
      viewSubmoduleDiff("C:/repo", "abc", "def", "vendor/lib", dataSource as never)
    ).resolves.toContain("Unable to retrieve");
    expect(mock.openTextDocument).not.toHaveBeenCalled();
  });

  it("absorbs notification failures", async () => {
    mock.showErrorMessage.mockRejectedValue(new Error("window disposed"));

    await expect(showErrorMessage("failed")).resolves.toBeUndefined();
  });
});
