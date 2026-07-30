/**
 * Names and message shapes shared by the extension host and the helper
 * process Git spawns. Kept in one module so the two sides cannot drift.
 */

/** Absolute path to the Node binary the helper should run under. */
export const ASKPASS_NODE_ENV = "AN_DR_COMMITS_ASKPASS_NODE";

/** Absolute path to the compiled helper entry point. */
export const ASKPASS_MAIN_ENV = "AN_DR_COMMITS_ASKPASS_MAIN";

/** Address of the host's IPC endpoint for this session. */
export const ASKPASS_PIPE_ENV = "AN_DR_COMMITS_ASKPASS_PIPE";

/** One credential question, exactly as Git phrased it. */
export type AskpassRequest = {
  prompt: string;
};

/** The answer, or null when the user dismissed the prompt. */
export type AskpassResponse = {
  value: string | null;
};

/**
 * Git treats a prompt containing "password" or "passphrase" as secret input.
 * Matching Git's own wording keeps the input box masked for the same prompts
 * Git would have masked at a terminal.
 */
export function isSecretPrompt(prompt: string): boolean {
  return /pass(word|phrase)/i.test(prompt);
}
