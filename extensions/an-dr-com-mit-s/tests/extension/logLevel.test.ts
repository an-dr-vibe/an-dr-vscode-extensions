import { describe, expect, it } from "vitest";

import { isLevelEnabled, type LogLevel } from "@/extension/utils/logger";

const LEVELS: LogLevel[] = ["Debug", "Info", "Warning", "Error"];

describe("isLevelEnabled", () => {
  it("passes a record at exactly the threshold", () => {
    for (const level of LEVELS) {
      expect(isLevelEnabled(level, level)).toBe(true);
    }
  });

  it("passes anything more severe than the threshold", () => {
    expect(isLevelEnabled("Error", "Debug")).toBe(true);
    expect(isLevelEnabled("Warning", "Info")).toBe(true);
  });

  it("drops anything less severe than the threshold", () => {
    expect(isLevelEnabled("Debug", "Info")).toBe(false);
    expect(isLevelEnabled("Info", "Error")).toBe(false);
  });

  it("passes every level at the Debug threshold", () => {
    for (const level of LEVELS) {
      expect(isLevelEnabled(level, "Debug")).toBe(true);
    }
  });

  it("passes only Error at the Error threshold", () => {
    expect(LEVELS.filter((level) => isLevelEnabled(level, "Error"))).toEqual(["Error"]);
  });
});
