# Acceptance scenarios

A manual checklist of observable behaviour, not copied markup or styles. Each
row is checked against the running extension, not inferred from source. Fill
in the Staging column as each backlog item lands; leave it blank until then
rather than guessing.

|   # | Scenario                                                                                                                      | Current | Staging |
| --: | ----------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
|   1 | Opening a workspace with one Git repository shows it in the graph automatically                                               | ✓       |         |
|   2 | Opening a workspace with no Git repository shows a clear "not found" state, and `addGitRepository` remains invokable from it  | ✓       |         |
|   3 | `addGitRepository` on a non-Git folder shows an error and adds nothing                                                        | ✓       |         |
|   4 | Selecting a different repository from the dropdown persists across a window reload                                            | ✓       |         |
|   5 | The status bar item reflects the current repository and updates on branch change                                              | ✓       |         |
|   6 | `fetch`/`pull`/`push` run against the selected repository and surface Git errors as a message, not a hang                     | ✓       |         |
|   7 | `pull`/`push` against a remote requiring credentials prompts rather than hanging silently                                     | ✓       |         |
|   8 | The Activity Bar sidebar shows working-tree changes and a compact graph for the selected repository                           | ✓       |         |
|   9 | Inline blame appears next to the active line and updates when the cursor moves                                                | ✓       |         |
|  10 | Viewing a commit's details shows the file tree, diff, and copy/open actions                                                   | ✓       |         |
|  11 | Viewing a diff for an added or deleted file renders an empty side rather than erroring                                        | ✓       |         |
|  12 | Comparing two arbitrary commits works, not only a commit against its parent                                                   | ✓       |         |
|  13 | `removeGitRepository` removes the repository from the dropdown without touching the working tree                              | ✓       |         |
|  14 | Sending a commit range to Code Review works when that extension is installed, and fails visibly (not silently) when it is not | ✓       |         |
|  15 | Uninstalling the extension clears the state keys it wrote                                                                     | ✓       |         |
|  16 | All settings-UI strings and dialogs are present in `zh-cn` and `zh-tw`                                                        | ✓       |         |

This list grows as backlog items are scheduled; a scenario with no number
above is not yet in scope for the transition, not forgotten.
