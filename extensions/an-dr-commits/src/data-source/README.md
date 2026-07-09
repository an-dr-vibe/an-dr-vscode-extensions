# `src/data-source/`

Support modules for `../dataSource.ts`, which owns all git command execution. Parsing
and modeling logic lives here, separate from the spawn/exec plumbing. Everything here
is pure data transformation — no `child_process`, no VS Code API.

| File | Purpose |
|---|---|
| `models.ts` | Internal model and response interfaces used across `dataSource.ts` (`GitBranchData`, `GitCommitData`, `GitCommitDetailsData`, `GitCommitComparisonData`, `GitWorkingTreeChange(s)Data`, `GitRef`, …) |
| `parsers.ts` | Turns raw git stdout into the model types above — branches, branch upstreams, commit details, log, refs, diff name-status, diff numstat |
| `helpers.ts` | Smaller formatting/lookup helpers: building `GitFileChange[]` from diff records, reading a value out of a parsed git config set, formatting error messages from a failed git process, trimming trailing blank lines |
