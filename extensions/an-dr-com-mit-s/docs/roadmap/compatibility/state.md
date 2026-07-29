# View IDs and storage keys

Source of fact: `extensionState.ts`, `diffDocProvider.ts`, and
`package.json` in both extensions, read directly.

## Storage keys

Both extensions currently use the identical key names below, scoped to their
own `globalState`/`workspaceState` under their own extension ID — there is no
collision today because VS Code namespaces storage per extension.

| Key              | Storage   | Current shape                                                                                                      | Staging shape                              |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `avatarCache`    | global    | `{ [email]: Avatar }`, `Avatar = { image, timestamp, identicon }`                                                  | identical shape                            |
| `lastActiveRepo` | workspace | `string \| null`                                                                                                   | identical shape                            |
| `repoStates`     | workspace | `{ [repo]: GitRepoState }`, ~15 fields (`commitDetailsViewDivider`, `columnWidths`, `hideRemotes`, `starred`, ...) | `{ [repo]: { columnWidths } }` — one field |

**Decision, already recorded in the roadmap's _Decisions now recorded_:**
workspace state does not migrate from the current extension. The final
identity writes versioned keys (e.g. `v2.repoStates`) and never touches the
legacy key, so a user who rolls back to the current extension keeps their
existing `repoStates` intact. This was learned the hard way: the previous
cutover attempt reused the bare key name, which would have collapsed a
15-field object down to one field on first write, for every existing user, the
moment the final identity activated.

## View IDs

| Surface                | Current                                       | Staging today | Target                                 |
| ---------------------- | --------------------------------------------- | ------------- | -------------------------------------- |
| Activity Bar container | `an-dr-commits-container`                     | none          | New implementation — backlog 5 group A |
| Activity Bar view      | `an-dr-commits.activityView` (type `webview`) | none          | New implementation — backlog 5 group A |

## Virtual diff scheme

|                          | Current         | Staging today                              |
| ------------------------ | --------------- | ------------------------------------------ |
| `DiffDocProvider.scheme` | `an-dr-commits` | `an-dr-com-mit-s` (its own `EXTENSION_ID`) |

Already MIT structurally — the staging provider works correctly under its own
scheme. The only remaining step is the identity rename at cutover, covered by
_Target end state_ in the main roadmap.
