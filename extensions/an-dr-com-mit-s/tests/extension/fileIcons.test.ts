import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

import { loadFileIcons } from "@/extension/fileIcons";

describe("loadFileIcons", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty map when the icon extension is not installed", () => {
    expect(loadFileIcons()).toEqual({});
  });

  it("reads and resizes SVGs when the icon extension is installed", () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-file-icons-"));
    const iconsDir = path.join(extensionPath, "fileicons", "icons");
    fs.mkdirSync(iconsDir, { recursive: true });
    fs.writeFileSync(path.join(iconsDir, "file-default.svg"), '<svg viewBox="0 0 16 16"></svg>');
    fs.writeFileSync(path.join(iconsDir, "typescript.svg"), '<svg viewBox="0 0 16 16"></svg>');

    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      extensionPath
    } as ReturnType<typeof vscode.extensions.getExtension>);

    const icons = loadFileIcons();

    expect(icons[""]).toBe('<svg width="16" height="16" viewBox="0 0 16 16"></svg>');
    for (const ext of ["ts", "tsx", "mts", "cts"]) {
      expect(icons[ext]).toBe(icons["ts"]);
    }
    expect(icons["js"]).toBeUndefined();

    fs.rmSync(extensionPath, { recursive: true, force: true });
  });

  it("omits an icon slot whose SVG file is missing rather than throwing", () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-file-icons-"));
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      extensionPath
    } as ReturnType<typeof vscode.extensions.getExtension>);

    expect(loadFileIcons()).toEqual({ "": "" });

    fs.rmSync(extensionPath, { recursive: true, force: true });
  });
});
