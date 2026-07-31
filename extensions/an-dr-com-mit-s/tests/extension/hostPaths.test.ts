import * as path from "node:path";

import { describe, expect, it } from "vitest";
import * as vscode from "vscode";

import { buildExtensionUri, getPathFromUri } from "@/extension/utils/hostPaths";

/**
 * These helpers speak VS Code's Uri type, which is why they sit in the host
 * layer rather than the core.
 */
describe("host path helpers", () => {
  it("normalises a Uri to forward slashes", () => {
    expect(getPathFromUri(vscode.Uri.file("C:\\work\\file.ts") as never)).toBe("C:/work/file.ts");
  });

  it("builds a URI by joining the extension path and components", () => {
    const uri = buildExtensionUri("/extension", "media", "main.css");
    expect(uri.toString()).toBe(path.join("/extension", "media", "main.css"));
  });
});
