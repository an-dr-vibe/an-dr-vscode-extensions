import { getNonce } from "@an-dr/commits-core/backend/utils/nonce";
import { describe, expect, it } from "vitest";

describe("getNonce", () => {
  it("returns a fresh 32-character alphanumeric nonce", () => {
    const first = getNonce();
    const second = getNonce();

    expect(first).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(second).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(second).not.toBe(first);
  });
});
