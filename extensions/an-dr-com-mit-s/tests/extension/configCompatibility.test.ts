import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const explicit = new Map<string, unknown>();
  const resolved = new Map<string, unknown>();
  return {
    explicit,
    resolved,
    workspace: {
      getConfiguration: (section: string) => ({
        get: (setting: string, defaultValue: unknown) =>
          resolved.get(`${section}.${setting}`) ?? defaultValue,
        inspect: (setting: string) => {
          const configKey = `${section}.${setting}`;
          return explicit.has(configKey)
            ? { key: configKey, globalValue: explicit.get(configKey) }
            : undefined;
        }
      })
    }
  };
});

vi.mock("vscode", () => ({ workspace: mock.workspace }));

import { config } from "@/extension/utils/vscodeConfigPort";

describe("compatibility configuration", () => {
  beforeEach(() => {
    mock.explicit.clear();
    mock.resolved.clear();
  });

  it("reads retained current-extension values when staging is not explicit", () => {
    mock.resolved.set("an-dr-commits.repository.commits.fetchAvatars", true);
    mock.resolved.set("an-dr-commits.statusBarIconOnly", false);

    expect(config.fetchAvatars()).toBe(true);
    expect(config.statusBarIconOnly()).toBe(false);
  });

  it("gives an explicit staging value precedence over compatibility fallback", () => {
    mock.explicit.set("an-dr-com-mit-s.fetchAvatars", false);
    mock.resolved.set("an-dr-commits.repository.commits.fetchAvatars", true);

    expect(config.fetchAvatars()).toBe(false);
  });

  it("reacts to both staging and compatibility status-bar keys", () => {
    // The change event now arrives through the host port, which reports a
    // namespace and key rather than one dotted string.
    for (const changed of ["an-dr-com-mit-s", "an-dr-commits"]) {
      expect(
        config.affectsStatusBarIconOnly({
          affects: (namespace: string, key?: string) =>
            namespace === changed && key === "statusBarIconOnly"
        })
      ).toBe(true);
    }
  });
});
