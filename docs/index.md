# Docs Index

## Architecture Decision Records

`docs/adr/` here at the repo root holds only decisions that cut across more than one
extension (e.g. shared install tooling). Each extension keeps its own ADR history in
its own `extensions/<name>/docs/adr/`.

- [ADR-001: install.ps1 marks an-dr extensions as application-scoped](adr/ADR-001-install-application-scoped-extensions.md)
- [ADR-002: install.ps1 fails loudly on a failed extension build](adr/ADR-002-install-fails-loudly-on-build-failure.md)

### Per-extension ADRs

- [an-dr-commits](../extensions/an-dr-commits/docs/adr/)
- [an-dr-code-review](../extensions/an-dr-code-review/docs/adr/)
- [an-dr-code-analysis](../extensions/an-dr-code-analysis/docs/adr/)
- [an-dr-sync](../extensions/an-dr-sync/docs/adr/)
- [an-dr-extensions](../extensions/an-dr-extensions/docs/adr/)

## Reviews

- [2026-07-18: decouple-vscode-git](reviews/2026-07-18-decouple-vscode-git.md)
