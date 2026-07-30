/**
 * The helper Git runs as GIT_ASKPASS. Git passes the prompt as argv[2] and
 * reads the answer from stdout; that contract is Git's, not ours.
 *
 * This process cannot show UI, so it forwards the prompt to the extension
 * host over the session's IPC endpoint and prints whatever comes back. It
 * exits non-zero without printing when the user dismisses the prompt, which
 * is how Git learns to abort instead of retrying forever.
 */
import * as net from "node:net";

import { ASKPASS_PIPE_ENV, type AskpassRequest, type AskpassResponse } from "./askpassProtocol";

function requestCredential(pipe: string, prompt: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipe);
    let received = "";

    socket.on("connect", () => {
      const request: AskpassRequest = { prompt };
      socket.write(JSON.stringify(request) + "\n");
    });
    socket.on("data", (chunk) => {
      received += chunk.toString("utf8");
      const newline = received.indexOf("\n");
      if (newline !== -1) {
        socket.end();
        try {
          const response = JSON.parse(received.slice(0, newline)) as AskpassResponse;
          resolve(response.value);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(null));
  });
}

async function main() {
  const pipe = process.env[ASKPASS_PIPE_ENV];
  const prompt = process.argv[2] ?? "";
  if (!pipe) {
    process.exit(1);
  }

  const value = await requestCredential(pipe, prompt);
  if (value === null) {
    // No output plus a non-zero exit tells Git the user cancelled.
    process.exit(1);
  }
  process.stdout.write(value);
}

void main().catch(() => process.exit(1));
