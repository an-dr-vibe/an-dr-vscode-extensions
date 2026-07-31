import { evalPromises } from "@an-dr/commits-core/backend/utils/promise";
import { describe, expect, it } from "vitest";

describe("evalPromises", () => {
  it("preserves input order while respecting the concurrency limit", async () => {
    let active = 0;
    let maximumActive = 0;
    const delays = new Map([
      [1, 15],
      [2, 5],
      [3, 0]
    ]);

    const results = await evalPromises(
      [1, 2, 3],
      2,
      (value) =>
        new Promise<number>((resolve) => {
          active++;
          maximumActive = Math.max(maximumActive, active);
          setTimeout(() => {
            active--;
            resolve(value * 10);
          }, delays.get(value));
        })
    );

    expect(results).toEqual([10, 20, 30]);
    expect(maximumActive).toBe(2);
  });

  it("resolves an empty input without starting work", async () => {
    await expect(evalPromises<number, number>([], 2, () => Promise.resolve(1))).resolves.toEqual(
      []
    );
  });

  it("rejects when an item rejects", async () => {
    await expect(
      evalPromises([1, 2], 2, (value) =>
        value === 2 ? Promise.reject(new Error("failed")) : Promise.resolve(value)
      )
    ).rejects.toBeUndefined();
  });
});
