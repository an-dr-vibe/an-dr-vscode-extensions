# Compatibility ledger

This directory records the public manifest contract accepted at the MIT cutover.
The ledger tracks every public command, setting, view, and URI scheme exactly
once; behaviour is covered by the acceptance scenarios rather than copied
source. It is deliberately static after cutover so the migration evidence
cannot be regenerated from the replacement implementation.

## Cutover constraints

- Preserve `LICENSE` and `NOTICE.md`, and retain the neo-git-graph revision recorded in the notice.
- Resolve every ledger row before identity switch; an unsupported command must show a clear staging capability error.
- Run provenance, build, test, lint, format, localization, clean-profile, and three-platform matrix checks.

## Rollback

Create an annotated rollback tag immediately before the identity switch. To recover, restore the prior `extensions/an-dr-commits` directory from that tag, run `install.ps1`, and reload VS Code. The migration reader is additive and never deletes legacy configuration or state.
