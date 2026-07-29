# `src/gitEditor/`

Implements `GIT_EDITOR` so git operations that need an editor (interactive rebase
todo list, commit message editing, etc.) open inside VS Code instead of failing or
falling back to a terminal editor. Same IPC-over-socket pattern as `../askpass/`.

| File | Purpose |
|---|---|
| `gitEditorManager.ts` | `GitEditorManager` — runs the IPC server, sets `GIT_EDITOR` to `git-editor.sh` and the handle path via env, opens the target file in a VS Code editor and resolves once it's closed/saved. Also exposes `showCommitMessageEditor()` directly (used by `dataSource.ts` for reword/commit-message prompts): writes a temp `COMMIT_EDITMSG` file, opens it with the `git-commit` language mode, and returns its content once the tab is closed — independent of the `GIT_EDITOR` hook |
| `gitEditorMain.ts` | Standalone entry-point script — git invokes this directly as a separate Node process (not imported as a module); forwards the file path to the manager over the IPC socket and blocks until it responds |
| `git-editor.sh` / `git-editor-empty.sh` | Shell wrappers so git can invoke `gitEditorMain.ts` via `node` |
