import { describe, expect, it } from "vitest";

import { resolveFileIcon } from "@/webview/utils/fileIcons";

const icons = {
  ts: "<svg>ts</svg>",
  "package.json": "<svg>pkg</svg>",
  "": "<svg>default</svg>"
};

describe("resolveFileIcon", () => {
  it("matches an exact filename before an extension", () => {
    expect(resolveFileIcon(icons, "package.json")).toBe("<svg>pkg</svg>");
  });

  it("matches a lowercased extension when no exact name matches", () => {
    expect(resolveFileIcon(icons, "index.ts")).toBe("<svg>ts</svg>");
    expect(resolveFileIcon(icons, "index.TS")).toBe("<svg>ts</svg>");
  });

  it("falls back to the default icon when nothing else matches", () => {
    expect(resolveFileIcon(icons, "README")).toBe("<svg>default</svg>");
  });

  it("returns null when even the default icon is missing", () => {
    expect(resolveFileIcon({}, "README")).toBeNull();
  });

  it("does not treat a leading dot as an extension separator", () => {
    expect(resolveFileIcon(icons, ".gitignore")).toBe("<svg>default</svg>");
  });
});
