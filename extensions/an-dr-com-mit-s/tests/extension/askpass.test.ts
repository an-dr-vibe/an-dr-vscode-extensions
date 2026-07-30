import * as net from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createAskpass } from "@/askpass/askpass";
import {
  ASKPASS_MAIN_ENV,
  ASKPASS_NODE_ENV,
  ASKPASS_PIPE_ENV,
  isSecretPrompt
} from "@/askpass/askpassProtocol";

const disposables: Array<{ dispose(): void }> = [];

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

/** Speaks the helper's side of the protocol, without spawning a process. */
function ask(pipe: string, prompt: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipe);
    let received = "";
    socket.on("connect", () => socket.write(JSON.stringify({ prompt }) + "\n"));
    socket.on("data", (chunk) => {
      received += chunk.toString("utf8");
      const newline = received.indexOf("\n");
      if (newline !== -1) {
        socket.end();
        resolve(JSON.parse(received.slice(0, newline)).value);
      }
    });
    socket.on("error", reject);
  });
}

describe("createAskpass", () => {
  it("exposes the environment Git needs to reach the helper", async () => {
    const askpass = await createAskpass("/ext", async () => "secret");
    disposables.push(askpass);

    expect(askpass.env.GIT_ASKPASS).toContain("askpass.sh");
    expect(askpass.env[ASKPASS_MAIN_ENV]).toContain("askpass.js");
    expect(askpass.env[ASKPASS_NODE_ENV]).toBe(process.execPath);
    expect(askpass.env[ASKPASS_PIPE_ENV]).toBeTruthy();
  });

  it("answers a prompt with the value the user supplied", async () => {
    const asked: string[] = [];
    const askpass = await createAskpass("/ext", async (prompt) => {
      asked.push(prompt);
      return "hunter2";
    });
    disposables.push(askpass);

    await expect(ask(askpass.env[ASKPASS_PIPE_ENV], "Password for 'https://x':")).resolves.toBe(
      "hunter2"
    );
    expect(asked).toEqual(["Password for 'https://x':"]);
  });

  it("answers null when the user dismisses the prompt", async () => {
    const askpass = await createAskpass("/ext", async () => null);
    disposables.push(askpass);

    await expect(ask(askpass.env[ASKPASS_PIPE_ENV], "Username:")).resolves.toBeNull();
  });

  it("answers null rather than throwing when prompting fails", async () => {
    const askpass = await createAskpass("/ext", async () => {
      throw new Error("prompt exploded");
    });
    disposables.push(askpass);

    await expect(ask(askpass.env[ASKPASS_PIPE_ENV], "Username:")).resolves.toBeNull();
  });

  it("serves more than one question on separate connections", async () => {
    const askpass = await createAskpass("/ext", async (prompt) =>
      prompt.startsWith("Username") ? "alice" : "hunter2"
    );
    disposables.push(askpass);

    await expect(ask(askpass.env[ASKPASS_PIPE_ENV], "Username for 'x':")).resolves.toBe("alice");
    await expect(ask(askpass.env[ASKPASS_PIPE_ENV], "Password for 'x':")).resolves.toBe("hunter2");
  });

  it("stops accepting connections once disposed", async () => {
    const askpass = await createAskpass("/ext", async () => "secret");
    const pipe = askpass.env[ASKPASS_PIPE_ENV];
    askpass.dispose();

    await expect(ask(pipe, "Username:")).rejects.toThrow();
  });

  it("gives each session its own endpoint", async () => {
    const first = await createAskpass("/ext", async () => "a");
    const second = await createAskpass("/ext", async () => "b");
    disposables.push(first, second);

    expect(first.env[ASKPASS_PIPE_ENV]).not.toBe(second.env[ASKPASS_PIPE_ENV]);
  });
});

describe("isSecretPrompt", () => {
  it("masks password and passphrase prompts", () => {
    expect(isSecretPrompt("Password for 'https://x':")).toBe(true);
    expect(isSecretPrompt("Enter passphrase for key '/id_rsa':")).toBe(true);
  });

  it("does not mask username prompts", () => {
    expect(isSecretPrompt("Username for 'https://x':")).toBe(false);
  });
});
