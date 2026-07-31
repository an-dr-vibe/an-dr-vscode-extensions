import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "@/extension/utils/vscodeConfigPort";

/**
 * The palette is declared twice: in the manifest, which the settings UI shows,
 * and in config.ts, which supplies the value when the setting is unset. They
 * have to agree or the graph draws in colours the user was never offered.
 */
describe("graph palette", () => {
  const EXPECTED = ["#6ba2f2", "#ca3a7d", "#f3b33e", "#61aea6", "#ac70f7"];

  it("defaults to the five muted lane colours", () => {
    expect(config.graphColours()).toEqual(EXPECTED);
  });

  it("declares the same default in the manifest", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")
    );
    const declared =
      manifest.contributes.configuration.properties["an-dr-com-mit-s.graphColours"].default;
    expect(declared).toEqual(EXPECTED);
  });
});
