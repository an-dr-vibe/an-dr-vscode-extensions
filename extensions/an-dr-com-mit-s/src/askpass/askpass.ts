import * as crypto from "node:crypto";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import {
  ASKPASS_MAIN_ENV,
  ASKPASS_NODE_ENV,
  ASKPASS_PIPE_ENV,
  type AskpassRequest,
  type AskpassResponse
} from "./askpassProtocol";

/** Answers one credential question, or null when the user dismisses it. */
export type CredentialPrompt = (prompt: string) => Promise<string | null>;

export type Askpass = {
  /** Environment additions that make Git route prompts through this host. */
  readonly env: Readonly<Record<string, string>>;
  /** Stops listening and releases the endpoint. Safe to call twice. */
  dispose(): void;
};

/**
 * A per-session endpoint address. Windows requires the named-pipe prefix;
 * every other platform uses a Unix socket under the temp directory. The
 * random suffix keeps concurrent windows from colliding.
 */
function createPipeAddress(): string {
  const id = `an-dr-commits-askpass-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  return process.platform === "win32"
    ? path.join("\\\\.\\pipe\\", id)
    : path.join(os.tmpdir(), `${id}.sock`);
}

/**
 * Starts the credential endpoint Git's askpass helper talks to.
 *
 * Each connection carries exactly one newline-delimited JSON question and
 * receives one newline-delimited JSON answer. Prompting is injected rather
 * than imported so the flow is testable without VS Code UI.
 *
 * @param extensionPath Root of the installed extension, used to locate the
 *   compiled helper and its shell wrapper under `out/`.
 * @param prompt Shows the question and resolves with the answer, or null.
 */
export function createAskpass(extensionPath: string, prompt: CredentialPrompt): Promise<Askpass> {
  const pipe = createPipeAddress();
  const server = net.createServer((socket) => {
    let received = "";
    socket.on("data", (chunk) => {
      received += chunk.toString("utf8");
      const newline = received.indexOf("\n");
      if (newline === -1) {
        return;
      }
      const line = received.slice(0, newline);
      received = "";
      void answer(line, socket, prompt);
    });
    // A helper that exits early is normal (Git gave up); never crash the host.
    socket.on("error", () => socket.destroy());
  });
  server.on("error", () => {
    /* Endpoint failures degrade to "no askpass"; Git then fails visibly. */
  });

  return new Promise<Askpass>((resolve, reject) => {
    server.once("error", reject);
    server.listen(pipe, () => {
      server.removeListener("error", reject);
      resolve({
        env: {
          GIT_ASKPASS: path.join(extensionPath, "out", "askpass.sh"),
          [ASKPASS_NODE_ENV]: process.execPath,
          [ASKPASS_MAIN_ENV]: path.join(extensionPath, "out", "askpass.js"),
          [ASKPASS_PIPE_ENV]: pipe
        },
        dispose() {
          server.close();
        }
      });
    });
  });
}

async function answer(line: string, socket: net.Socket, prompt: CredentialPrompt) {
  let value: string | null;
  try {
    const request = JSON.parse(line) as AskpassRequest;
    value = await prompt(request.prompt);
  } catch {
    value = null;
  }
  const response: AskpassResponse = { value };
  socket.end(JSON.stringify(response) + "\n");
}
