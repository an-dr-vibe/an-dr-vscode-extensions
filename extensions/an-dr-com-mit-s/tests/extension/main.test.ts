import { describe, expect, it } from "vitest";

import { mergeStartupRepos } from "@/extension/main";

describe("extension startup repositories", () => {
  it("restores external repositories without duplicating workspace discoveries", () => {
    expect(mergeStartupRepos(["C:/workspace"], ["C:/external", "C:/workspace"])).toEqual([
      "C:/workspace",
      "C:/external"
    ]);
  });
});
