export function activityCss() {
	return `
body.activityChangesBody{position:fixed;inset:0;margin:0;background:var(--vscode-sideBar-background,var(--vscode-editor-background));color:var(--vscode-sideBar-foreground,var(--vscode-editor-foreground));font-family:var(--vscode-font-family);font-size:13px;display:flex;flex-direction:column;overflow:hidden;}
#activityTop{display:flex;align-items:center;gap:6px;padding:8px;border-bottom:1px solid rgba(128,128,128,0.22);box-sizing:border-box;}
.activityPrimaryBtn{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;flex:1;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font:inherit;font-weight:600;padding:5px 8px;cursor:pointer;}
.activityPrimaryBtn:hover{background:var(--vscode-button-hoverBackground);}
#activityRepo{padding:5px 10px;border-bottom:1px solid rgba(128,128,128,0.16);color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#activityRepoRow{display:flex;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid rgba(128,128,128,0.16);box-sizing:border-box;}
#activityRepoDropdown{flex:1;min-width:0;margin:0;display:block;width:100%;}
#activityRepoDropdown .dropdown,#activityRepoDropdown .dropdown.loaded{display:block;width:100%;}
#activityRepoDropdown .dropdownCurrentValue{width:100% !important;max-width:none;box-sizing:border-box;}
#activityRepoDropdown .dropdownMenu{width:100%;box-sizing:border-box;left:0;right:auto;}
.activityIconBtn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;border:none;border-radius:3px;background:transparent;color:inherit;opacity:0.72;cursor:pointer;}
.activityIconBtn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground,rgba(128,128,128,0.18));}
#activityGraph{flex:0 0 auto;overflow-y:auto;max-height:var(--activity-graph-height);position:relative;}
#activityGraphResizeHandle{flex:0 0 auto;height:4px;cursor:ns-resize;position:relative;border-top:1px solid rgba(128,128,128,0.16);}
#activityGraphResizeHandle::after{content:'';position:absolute;left:0;right:0;top:1px;height:2px;border-radius:1px;}
#activityGraphResizeHandle:hover::after,#activityGraphResizeHandle.resizing::after{background:var(--vscode-sash-hoverBorder,rgba(128,128,128,0.5));}
#miniGraph{display:flex;align-items:flex-start;}
#miniGraphRows{flex:1 1 0;min-width:0;overflow:hidden;}
.miniCommit{display:flex;align-items:center;height:24px;gap:4px;padding:0 4px 0 0;cursor:pointer;box-sizing:border-box;}
.miniCommit:hover{background:var(--vscode-list-hoverBackground,rgba(128,128,128,0.12));}
.miniCommitHead .miniCommitMsg{font-weight:600;}
.miniCommitTags{display:inline-flex;align-items:center;flex:0 0 auto;min-width:0;margin-left:1px;}
.miniCommitTags .gitRef{margin-top:0;margin-right:3px;max-width:84px;}
.miniCommitTags .gitRefName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.miniCommitTags .miniTagMore .gitRefName{display:block;padding:0;width:19px;text-align:center;font-size:11px;font-weight:600;}
.miniCommitMsg{flex:1 1 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;}
.miniCommitHash{flex:0 0 auto;font-size:10px;opacity:0.5;font-family:var(--vscode-editor-font-family,monospace);}
#miniCommitGraph circle.current{fill:var(--vscode-editor-background);stroke-width:2.1;}
#miniCommitGraph circle:not(.current){stroke:var(--vscode-editor-background);stroke-width:0.85;stroke-opacity:0.65;}
#miniCommitGraph path.shadow{fill:none;stroke:var(--vscode-editor-background);stroke-opacity:0.6;stroke-width:3;}
#miniCommitGraph path.line{fill:none;stroke-width:1.5;}
body.vscode-light #miniCommitGraph path.line,body.vscode-light #miniCommitGraph circle:not(.current){filter:saturate(1.12) contrast(1.08) brightness(0.94);}
#activityContent{flex:1 1 0;overflow:auto;min-height:0;padding-top:4px;}
#activityFooter{flex:0 0 auto;border-top:1px solid rgba(128,128,128,0.2);}
#activityContent > .fileTreeFolderContents{display:inline-block;min-width:100%;}
#cpCommitBtn{display:flex;align-items:center;justify-content:center;gap:4px;}
`;
}
