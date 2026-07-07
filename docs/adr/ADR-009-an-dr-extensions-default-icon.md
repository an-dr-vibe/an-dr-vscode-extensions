# ADR-009: an-dr-extensions default icon matches VS Code's native placeholder

## Problem

Extensions with no `icon` field in their `package.json` (e.g. "Arm Assembly") rendered as a
blank 32x32 box - there was no visual placeholder at all, unlike VS Code's own Extensions
view, which shows a recognizable default icon for the same case.

## Decision

- Read VS Code's actual source rather than approximating: the native default is
  `Codicon.extensionsLarge`, registered as `extension-default-icon` in
  `extensionManagement/common/extensionsIcons.ts` ("Icon used for the default extension in
  the extensions view and editor"). Confirmed the exact CSS class
  (`.codicon-extensions-large`) exists in the published `@vscode/codicons` font package
  before using it, rather than guessing the glyph name.
- Added `@vscode/codicons` as a real runtime dependency (not devDependencies - its files
  need to exist in the installed extension's own folder at runtime, unlike the build-only
  TypeScript/typings packages already there). `GridState.codiconsCssUri` points at
  `<extensionUri>/node_modules/@vscode/codicons/dist/codicon.css`; `renderGridHtml` converts
  it via `webview.asWebviewUri` and links it in `<head>`, same pattern the official
  `webview-codicons-sample` in `microsoft/vscode-extension-samples` uses.
- **CSP updated**: `style-src` needed `webview.cspSource` added (not just `'unsafe-inline'`,
  which only covers inline `<style>`/style attributes, not an external stylesheet loaded via
  `<link>`), and a new `font-src ${webview.cspSource}` directive for the `@font-face` the
  linked CSS declares. No change to `localResourceRoots` - the codicon files live inside
  this extension's own folder, already covered by the existing
  `[state.installRoot]` (installRoot is that folder's parent).
- **`.vscodeignore` updated** to carve out `node_modules/@vscode/codicons/dist/{codicon.css,codicon.ttf}`
  from the blanket `node_modules/**` exclusion. This repo's extensions normally have an
  identical `.vscodeignore` copied verbatim (per root `AGENTS.md`), since none needed a real
  runtime npm dependency before - only `an-dr-extensions` diverges now, and only because
  it's the first to actually need one. Without this, the codicon font would silently be
  missing specifically when an extension is packaged into a `.vsix` (the "Reinstall All
  Extensions in Remote/Container" command in `an-dr-extension-control`) - the normal
  junction-based local install was never affected, since it symlinks the whole folder as-is
  regardless of `.vscodeignore`.

## Rationale

Using the real codicon font (rather than an inline SVG approximating the same silhouette)
means the placeholder is genuinely the same icon VS Code itself shows, including staying in
sync if that glyph is ever redesigned, and costs only a small, well-documented, officially
sampled integration pattern.

## Rejected alternatives

- An inline SVG puzzle-piece shape approximating the codicon glyph, avoiding a new
  dependency and CSP changes entirely: rejected - the request was specifically for "what the
  native uses," not a lookalike, and the real integration turned out to be a standard,
  bounded amount of work once the exact glyph was identified.
