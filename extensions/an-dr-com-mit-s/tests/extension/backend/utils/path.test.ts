import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";

import {
  buildExtensionUri,
  doesPathExist,
  getPathFromStr,
  getPathFromUri,
  isDirectory
} from "@/backend/utils/path";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    fs.rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

describe("path utilities", () => {
  it("distinguishes real directories, files, and missing paths", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "an-dr-path-"));
    const file = path.join(directory, "file.txt");
    fs.writeFileSync(file, "test");
    cleanup.push(directory);

    await expect(isDirectory(directory)).resolves.toBe(true);
    await expect(isDirectory(file)).resolves.toBe(false);
    await expect(isDirectory(path.join(directory, "missing"))).resolves.toBe(false);
    await expect(doesPathExist(file)).resolves.toBe(true);
    await expect(doesPathExist(path.join(directory, "missing"))).resolves.toBe(false);
  });

  it("normalises Windows separators without changing forward-slash paths", () => {
    expect(getPathFromStr("C:\\work/mixed\\file.ts")).toBe("C:/work/mixed/file.ts");
    expect(getPathFromStr("/workspace/file.ts")).toBe("/workspace/file.ts");
    expect(getPathFromStr("")).toBe("");
    expect(getPathFromUri(vscode.Uri.file("C:\\work\\file.ts") as never)).toBe("C:/work/file.ts");
  });

  it("builds a URI by joining the extension path and components", () => {
    const uri = buildExtensionUri("/extension", "media", "main.css");
    expect(uri.toString()).toBe(path.join("/extension", "media", "main.css"));
  });
});
