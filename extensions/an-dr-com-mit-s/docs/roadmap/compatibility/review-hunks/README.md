# REVIEW-verdict hunk reports

One report per `REVIEW` file in the old tree, listing the contiguous runs of
independently authored (`+`) lines worth carrying over. Generated with
`node scripts/check-provenance.js --annotate <file>`.

`REVIEW` means a file mixes imported Git Graph baseline with locally authored
work, so it cannot move wholesale — only the `+` runs may. These reports are
the per-file index of which runs those are.

## Verification

Every claimed range has been checked back against real `--annotate` output:
each line in each range must be marked `+`, never `B`, and each report's
stated baseline percentage must match the tool's.

| Reports | Ranges checked | Problems |
| ------: | -------------: | -------: |
|      40 |            174 |        0 |

The reports are accurate as of the commit that added this file. Re-run the
check if the baseline revision or the old tree ever changes — the ranges are
line numbers, so any edit to a source file invalidates them.

To re-verify, for one file:

```sh
node scripts/check-provenance.js --annotate extensions/an-dr-commits/src/repoFileWatcher.ts
```

and confirm the lines named in that file's report are `+`.

## Using them

A listed range is a candidate, not an instruction. Before copying one:

- Confirm the new extension has somewhere for it to go and something that
  calls it. An authored run whose only caller is a feature that does not exist
  yet is not ready to move — see
  [zero-blocker-finding.md](../zero-blocker-finding.md).
- Take the `+` lines only. Never widen a range to pick up surrounding context,
  because the surrounding context is exactly what the `B` marks exclude.
