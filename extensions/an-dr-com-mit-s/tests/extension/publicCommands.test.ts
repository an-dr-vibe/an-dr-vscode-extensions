import * as fs from "node:fs";
import * as path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const registered = new Map<string, (...args: unknown[]) => unknown>();
  return {
    openFile: vi.fn(() => Promise.resolve(null)),
    showErrorMessage: vi.fn(() => Promise.resolve()),
    showInformationMessage: vi.fn(() => Promise.resolve()),
    registered,
    vscode: {
      commands: {
        registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(id, handler);
          return { dispose: vi.fn() };
        }
      },
      l10n: {
        t: (message: string, ...args: unknown[]) =>
          args.reduce(
            (result, value, index) => result.replace(`{${index}}`, String(value)),
            message
          )
      },
      window: {
        activeTextEditor: undefined,
        showInformationMessage: (...args: unknown[]) => mock.showInformationMessage(...args)
      }
    }
  };
});

vi.mock("vscode", () => mock.vscode);
vi.mock("@/utils", () => ({
  openFile: (...args: unknown[]) => mock.openFile(...args),
  showErrorMessage: (...args: unknown[]) => mock.showErrorMessage(...args)
}));

import { PUBLIC_COMMAND_NAMES, registerPublicCommands } from "@/extension/publicCommands";

describe("public commands", () => {
  beforeEach(() => {
    mock.registered.clear();
    mock.openFile.mockClear();
    mock.showErrorMessage.mockClear();
    mock.showInformationMessage.mockClear();
  });

  it("keeps manifest declarations and runtime registrations in sync under staging", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { contributes: { commands: Array<{ command: string; title: string }> } };
    registerPublicCommands(createContext(), {});

    const manifestIds = manifest.contributes.commands.map(({ command }) => command).toSorted();
    const runtimeIds = [...mock.registered.keys()].toSorted();
    expect(runtimeIds).toEqual(manifestIds);
    expect(runtimeIds).toEqual(
      PUBLIC_COMMAND_NAMES.map((name) => `an-dr-com-mit-s.${name}`).toSorted()
    );
    expect(runtimeIds.every((id) => !id.startsWith("an-dr-commits."))).toBe(true);
    for (const locale of ["package.nls.json", "package.nls.zh-cn.json", "package.nls.zh-tw.json"]) {
      const messages = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), locale), "utf8")
      ) as Record<string, string>;
      for (const { title } of manifest.contributes.commands) {
        expect(messages[title.slice(1, -1)]).toBeTypeOf("string");
      }
    }
  });

  it("reports the running replacement version", async () => {
    registerPublicCommands(createContext("1.2.3"), {});

    await mock.registered.get("an-dr-com-mit-s.version")?.();

    expect(mock.showInformationMessage).toHaveBeenCalledWith("an-dr: Commits (MIT) version 1.2.3", {
      modal: true
    });
  });

  it("opens the working file represented by a staging diff URI", async () => {
    const dataSource = {} as never;
    registerPublicCommands(createContext(), {}, dataSource);

    await mock.registered.get("an-dr-com-mit-s.openFile")?.({
      scheme: "an-dr-com-mit-s",
      path: "src/file.ts",
      query: "commit=abc123&repo=C%3A%2Frepo"
    });

    expect(mock.openFile).toHaveBeenCalledWith("C:/repo", "src/file.ts", "abc123", dataSource);
  });

  it("returns a localized capability error for future command handlers", async () => {
    registerPublicCommands(createContext(), {});

    await mock.registered.get("an-dr-com-mit-s.fetch")?.();

    expect(mock.showErrorMessage).toHaveBeenCalledWith(
      "The fetch command is not available yet in the MIT replacement."
    );
  });
});

function createContext(version = "0.5.0") {
  return { extension: { packageJSON: { version } } } as never;
}
