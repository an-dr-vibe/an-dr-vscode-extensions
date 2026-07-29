import { describe, expect, it } from "vitest";

import { evalPromises } from "@/backend/utils/promise";

describe("evalPromises", () => {
  it("preserves input order while limiting concurrent work", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await evalPromises([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 10;
    });

    expect(result).toEqual([10, 20, 30, 40]);
    expect(maximumActive).toBe(2);
  });

  it("propagates a worker failure", async () => {
    await expect(
      evalPromises(["ok", "fail"], 1, async (value) => {
        if (value === "fail") {
          throw new Error("expected failure");
        }
        return value;
      })
    ).rejects.toThrow("expected failure");
  });
});
