# Commands

Source of fact: `extensions/an-dr-commits/package.json` (current, 9 commands)
and `extensions/an-dr-com-mit-s/package.json` (staging, 2 commands), read
directly rather than inferred from behaviour.

| Command               | Current default namespace           | Staging today                      | Status             | Target                                             |
| --------------------- | ----------------------------------- | ---------------------------------- | ------------------ | -------------------------------------------------- |
| `view`                | `an-dr-commits.view`                | `an-dr-com-mit-s.view`             | Already MIT        | Adapter only — rename at cutover                   |
| `clearAvatarCache`    | `an-dr-commits.clearAvatarCache`    | `an-dr-com-mit-s.clearAvatarCache` | Already MIT        | Adapter only — rename at cutover                   |
| `addGitRepository`    | `an-dr-commits.addGitRepository`    | No equivalent                      | New implementation | Backlog 4 — repository lifecycle                   |
| `removeGitRepository` | `an-dr-commits.removeGitRepository` | No equivalent                      | New implementation | Backlog 4 — repository lifecycle                   |
| `fetch`               | `an-dr-commits.fetch`               | No equivalent                      | New implementation | Backlog 6 — remote operations                      |
| `pull`                | `an-dr-commits.pull`                | No equivalent                      | New implementation | Backlog 6 — remote operations, needs askpass first |
| `push`                | `an-dr-commits.push`                | No equivalent                      | New implementation | Backlog 6 — remote operations, needs askpass first |
| `version`             | `an-dr-commits.version`             | No equivalent                      | New implementation | Trivial — one string, any backlog item             |
| `openFile`            | `an-dr-commits.openFile`            | No equivalent                      | New implementation | Backlog 8 — file workflows                         |

No command is retired. The gap is 7 of 9, matching the measured count in the
roadmap's _The gap to close_.
