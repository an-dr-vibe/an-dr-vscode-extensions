# `web/styles/`

CSS for the tab webview only — concatenated into `media/out.min.css`. The sidebar's
CSS lives separately in `../sidebar/styles/main.css` (bundled into
`sidebar.min.css`), since the two webviews load independent stylesheets.

| File | Styles for |
|---|---|
| `main.css` | Body, `#view`, `#content`, `#controls`, `#footer`, commit table, graph |
| `branchPanel.css` | `#sidebar` (the tab's own branch/tag panel, not the Activity Bar sidebar), `#sidebarToggle`, `#sidebarResizeHandle`, all `.branchPanel*` classes |
| `changesPanel.css` | The uncommitted-changes mode of the Files Panel (`web/changesPanel.ts`) |
| `contextMenu.css` | `.contextMenu*` |
| `dialog.css` | `.dialog*` |
| `dropdown.css` | `.dropdown*` (the `Dropdown` widget from `../common/dropdown.ts`) |
| `findWidget.css` | `#findWidget` |
| `settingsWidget.css` | `#settingsWidget` |
