# `src/askpass/`

Implements `GIT_ASKPASS` so git can prompt for HTTP credentials through a VS Code
input box instead of failing or falling back to a terminal prompt.

| File | Purpose |
|---|---|
| `askpassManager.ts` | `AskpassManager` — runs an HTTP server bound to a named pipe (Windows) / Unix socket (Linux/macOS), sets `GIT_ASKPASS` to `askpass.sh` and the handle path in `VSCODE_GIT_GRAPH_ASKPASS_HANDLE`, and shows a VS Code input box (masked if the prompt looks password-related) when a request arrives |
| `askpassMain.ts` | Standalone entry-point script — git invokes this directly as a separate Node process (not imported as a module), passing the prompt text as an argv. It posts the request to the manager over the IPC socket and writes the response to the output file path git gave it via `VSCODE_GIT_GRAPH_ASKPASS_PIPE` |
| `askpass.sh` / `askpass-empty.sh` | Shell wrappers so git (which expects an executable, not a `.js` file) can invoke `askpassMain.ts` via `node` |
