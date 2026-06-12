# CLAUDE.md

When working on anything inside `extensions/an-dr-commits/`, read [extensions/an-dr-commits/AGENTS.md](extensions/an-dr-commits/AGENTS.md) before touching any files. It contains the architecture overview, file map, build instructions, and a "where to look by feature" table that will save you from having to explore the codebase from scratch.

## Commit hygiene

Before committing, always run `git log --oneline -6` and check the previous commit(s). If the most recent commit(s) are WIP commits that touch the same extension or the same concern as the current work, squash them together into a single descriptive commit (`git reset --soft <hash-before-wips>` then one clean commit). The goal is no WIP commits left between proper commits — WIPs are only acceptable as the very tip of the branch while work is in progress.
