import * as vscode from 'vscode';
import { CustomGroups, ExtensionCardData, Group, GroupByMode, ProfileDescriptor, SYSTEM_CATEGORY } from './extensionsData';
import { StartupTiming } from './startupTiming';

export function renderGridHtml(
    webview: vscode.Webview,
    groups: Group[],
    allExtensionCategories: string[],
    hiddenCategories: Set<string>,
    groupBy: GroupByMode,
    startupTimings: Map<string, StartupTiming> | undefined,
    customGroups: CustomGroups,
    pendingUninstalls: Set<string>,
    codiconsCssUri: vscode.Uri,
    customProfiles: ProfileDescriptor[]
): string {
    const toolbar = renderToolbar(allExtensionCategories, hiddenCategories, groupBy);
    const sections = groups.map((group) => renderGroupSection(webview, group, hiddenCategories, startupTimings, pendingUninstalls)).join('\n');
    const nonce = createNonce();
    const codiconsHref = webview.asWebviewUri(codiconsCssUri).toString();
    // style-src/font-src need webview.cspSource (not just 'unsafe-inline') for the linked
    // codicon.css and the @font-face it declares to be allowed to load.
    const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${codiconsHref}">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
  .toolbar { position: relative; display: flex; flex-wrap: wrap; gap: 4px 8px; margin-bottom: 8px; }
  .toolbar-button, .toolbar-select { background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px;
    padding: 4px 10px; font-size: 0.85em; cursor: pointer; white-space: nowrap; }
  .toolbar-button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .filter-input { flex: 1; min-width: 80px; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px; padding: 3px 8px; font-size: 0.85em; }
  .filter-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .category-menu { display: none; position: absolute; top: 100%; left: 0; z-index: 1; min-width: 200px;
    margin-top: 4px; padding: 6px; background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-menu-border, transparent)); border-radius: 4px; }
  .category-menu.open { display: block; }
  .category-menu .show-all { display: block; width: 100%; text-align: left; background: none; border: none;
    color: var(--vscode-textLink-foreground); cursor: pointer; padding: 4px 2px; font-size: 0.85em; }
  .category-menu .show-all:hover { text-decoration: underline; }
  .category-menu label { display: flex; align-items: center; gap: 6px; padding: 3px 2px; font-size: 0.85em; cursor: pointer; }
  .category-menu hr { border: none; border-top: 1px solid var(--vscode-widget-border, transparent); margin: 4px 0; }
  h2 { font-size: 1em; margin: 16px 0 8px; }
  h2 .group-count { font-weight: normal; opacity: 0.7; font-size: 0.85em; }
  .group-section.section-empty, .card.hidden, .card.search-hidden { display: none; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px; }
  .card { position: relative; display: grid; grid-template-columns: 32px 1fr; align-items: start;
    column-gap: 8px; row-gap: 1px; padding: 6px 8px;
    border: 1px solid var(--vscode-widget-border, transparent); border-left: 3px solid transparent; border-radius: 4px;
    background: var(--vscode-sideBar-background); cursor: pointer; }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .card.status-enabled { border-left-color: var(--vscode-testing-iconPassed, #3fb950); }
  .card.status-disabled { border-left-color: var(--vscode-descriptionForeground); }
  .card.status-disabled::after { content: ''; position: absolute; inset: 0; border-radius: 4px;
    background: rgba(128, 128, 128, 0.25); pointer-events: none; }
  .card.status-disabled .name-text, .card.status-disabled .desc { color: var(--vscode-descriptionForeground); }
  .card.status-disabled img, .card.status-disabled .icon-placeholder { opacity: 0.5; }
  .card.status-pending-uninstall { border-left-color: var(--vscode-editorWarning-foreground, #d29922); opacity: 0.6; }
  .card .name .pending-badge { flex-shrink: 0; font-weight: normal; font-size: 0.7em;
    color: var(--vscode-editorWarning-foreground, #d29922); }
  .card .icon-col { grid-column: 1; grid-row: 1 / 3; display: flex; flex-direction: column;
    align-items: center; gap: 4px; }
  .card img { width: 32px; height: 32px; flex-shrink: 0; }
  .card .icon-placeholder { width: 32px; height: 32px; flex-shrink: 0; display: flex;
    align-items: center; justify-content: center; font-size: 28px;
    color: var(--vscode-icon-foreground, var(--vscode-foreground)); opacity: 0.6; }
  .card .card-checkbox { margin: 0; width: 14px; height: 14px; flex-shrink: 0; visibility: hidden; }
  body.selecting .card .card-checkbox { visibility: visible; }
  .card.checked { background: var(--vscode-list-inactiveSelectionBackground); border-color: var(--vscode-focusBorder); }
  .card .name { grid-column: 2; grid-row: 1; display: flex; align-items: center; gap: 6px;
    font-size: 0.85em; font-weight: 600; min-width: 0; }
  .card .name .name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .name .timing { flex-shrink: 0; font-weight: normal; font-size: 0.7em; opacity: 0.6; }
  .card .name .all-profiles-badge { flex-shrink: 0; font-weight: normal; font-size: 0.7em;
    padding: 0 4px; border-radius: 2px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .card .desc { grid-column: 2; grid-row: 2; font-size: 0.75em; opacity: 0.8; display: -webkit-box;
    -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .context-menu { display: none; position: fixed; z-index: 10; min-width: 160px; padding: 4px;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-menu-border, transparent));
    border-radius: 4px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
  .context-menu.open { display: block; }
  .context-menu button { display: block; width: 100%; text-align: left; background: none; border: none;
    color: var(--vscode-menu-foreground, var(--vscode-foreground)); cursor: pointer;
    padding: 6px 10px; font-size: 0.85em; border-radius: 2px; }
  .context-menu button:hover { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); }
  .context-menu .menu-groups, .context-menu .menu-profiles { display: none; }
  .context-menu .menu-groups.open, .context-menu .menu-profiles.open { display: block; }
  .context-menu .menu-back { color: var(--vscode-textLink-foreground); }
  .context-menu .groups-list, .context-menu .profiles-list { max-height: 160px; overflow-y: auto; }
  .context-menu .groups-list .no-groups, .context-menu .profiles-list .no-profiles {
    padding: 4px 10px; font-size: 0.85em; opacity: 0.7; }
  .context-menu .groups-list .group-remove { color: var(--vscode-descriptionForeground); }
  .context-menu hr { border: none; border-top: 1px solid var(--vscode-widget-border, transparent); margin: 4px 0; }
  .context-menu .new-group-row { display: flex; gap: 4px; padding: 4px 10px; }
  .context-menu .new-group-row input { flex: 1; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px; padding: 3px 6px; font-size: 0.85em; }
  .context-menu .new-group-row button { width: auto; }
  @media (max-width: 340px) {
    .toolbar > * { flex: 1 1 auto; }
  }
</style>
</head>
<body>
${toolbar}
<div id="groups">
${sections}
</div>
<div class="context-menu">
    <div class="menu-main">
        <button data-menu-action="open">Open Details</button>
        <button data-menu-action="add-to-group">Add to group ▸</button>
        <button data-menu-action="add-to-profile">Add to Profile ▸</button>
        <button data-menu-action="apply-to-all-profiles"></button>
        <button data-menu-action="uninstall">Uninstall</button>
        <button data-menu-action="copy-id">Copy ID</button>
    </div>
    <div class="menu-groups">
        <button class="menu-back">← Back</button>
        <hr>
        <div class="groups-list"></div>
        <div class="new-group-row">
            <input type="text" class="new-group-input" placeholder="New group...">
            <button class="new-group-add">Add</button>
        </div>
    </div>
    <div class="menu-profiles">
        <button class="menu-back">← Back</button>
        <hr>
        <div class="profiles-list"></div>
    </div>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const customGroups = ${JSON.stringify(customGroups).replace(/</g, '\\u003c')};
  const customProfiles = ${JSON.stringify(customProfiles).replace(/</g, '\\u003c')};

  // Selection for multi-item context-menu actions. Persisted alongside filter/scroll state
  // (see saveViewState below) so it survives the full-document re-renders this webview does
  // on every state change; cleared after any bulk action runs. selectionAnchorId tracks the
  // Explorer-style shift-click range anchor: the last card touched via checkbox or ctrl-click.
  const checkedIds = new Set();
  let selectionAnchorId = null;

  function setCardChecked(card, checked) {
    card.classList.toggle('checked', checked);
    const checkbox = card.querySelector('.card-checkbox');
    if (checkbox) {
      checkbox.checked = checked;
    }
  }

  // Checkboxes stay invisible (but still occupy their layout space - see .icon-col) until a
  // selection actually exists, so the grid isn't cluttered with them by default; Ctrl-click
  // (or the now-visible checkbox itself, once shown) is how a selection gets started.
  function updateSelectingClass() {
    document.body.classList.toggle('selecting', checkedIds.size > 0);
  }

  function setChecked(id, checked) {
    if (checked) {
      checkedIds.add(id);
    } else {
      checkedIds.delete(id);
    }
    const card = document.querySelector('.card[data-extension-id="' + CSS.escape(id) + '"]');
    if (card) {
      setCardChecked(card, checked);
    }
    updateSelectingClass();
    saveViewState();
  }

  function clearSelection() {
    checkedIds.clear();
    selectionAnchorId = null;
    document.querySelectorAll('.card').forEach((card) => setCardChecked(card, false));
    updateSelectingClass();
    saveViewState();
  }

  // Visible, in on-page order - matches what a shift-click range should span (filtered-out
  // or category-hidden cards shouldn't be selectable even if they fall between two clicks).
  function visibleCardIds() {
    return Array.from(document.querySelectorAll('.card'))
      .filter((card) => !card.classList.contains('hidden') && !card.classList.contains('search-hidden'))
      .map((card) => card.getAttribute('data-extension-id'));
  }

  function selectRange(fromId, toId) {
    const ids = visibleCardIds();
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) {
      setChecked(toId, true);
      return;
    }
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    checkedIds.clear();
    document.querySelectorAll('.card').forEach((card) => setCardChecked(card, false));
    for (let i = start; i <= end; i++) {
      setChecked(ids[i], true);
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && checkedIds.size > 0) {
      clearSelection();
    }
  });

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const id = card.getAttribute('data-extension-id');
      if (event.shiftKey) {
        selectRange(selectionAnchorId || id, id);
        selectionAnchorId = id;
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        setChecked(id, !checkedIds.has(id));
        selectionAnchorId = id;
        return;
      }
      vscode.postMessage({ type: 'openExtension', id });
    });
  });

  document.querySelectorAll('.card').forEach((card) => {
    const checkbox = card.querySelector('.card-checkbox');
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      const id = card.getAttribute('data-extension-id');
      setChecked(id, checkbox.checked);
      selectionAnchorId = id;
    });
  });

  const contextMenu = document.querySelector('.context-menu');
  let contextMenuExtensionId = null;
  let contextMenuBulkIds = null; // non-null in bulk mode: ids of every checked card
  let contextMenuBulkUninstallIds = [];
  let contextMenuBulkApplyAllIds = [];

  const openItem = contextMenu.querySelector('[data-menu-action="open"]');
  const addToGroupItem = contextMenu.querySelector('[data-menu-action="add-to-group"]');
  const uninstallItem = contextMenu.querySelector('[data-menu-action="uninstall"]');
  const applyAllItem = contextMenu.querySelector('[data-menu-action="apply-to-all-profiles"]');
  const copyIdItem = contextMenu.querySelector('[data-menu-action="copy-id"]');
  const SYSTEM_CATEGORY = ${JSON.stringify(SYSTEM_CATEGORY)};

  function cardEligibility(card) {
    return {
      id: card.getAttribute('data-extension-id'),
      isSystem: card.getAttribute('data-categories').split('|').includes(SYSTEM_CATEGORY),
      isDisabled: card.classList.contains('status-disabled'),
      appliesToAll: card.getAttribute('data-all-profiles') === 'true'
    };
  }

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const id = card.getAttribute('data-extension-id');
      contextMenuExtensionId = id;
      const isBulk = checkedIds.size > 0 && checkedIds.has(id);
      contextMenuBulkIds = isBulk ? Array.from(checkedIds) : null;

      openItem.style.display = isBulk ? 'none' : 'block';

      if (isBulk) {
        const targets = Array.from(document.querySelectorAll('.card'))
          .filter((c) => checkedIds.has(c.getAttribute('data-extension-id')))
          .map(cardEligibility);
        // Built-in (System) extensions cannot be uninstalled or scoped to all profiles;
        // disabled ones have no resolvable install location for the apply-to-all command
        // (see ADR-004) - ineligible items are silently skipped rather than blocking the
        // whole bulk action, matching how the single-item menu already hides these per-card.
        contextMenuBulkUninstallIds = targets.filter((t) => !t.isSystem).map((t) => t.id);
        contextMenuBulkApplyAllIds = targets.filter((t) => !t.isSystem && !t.isDisabled && !t.appliesToAll).map((t) => t.id);
        uninstallItem.style.display = contextMenuBulkUninstallIds.length > 0 ? 'block' : 'none';
        applyAllItem.style.display = contextMenuBulkApplyAllIds.length > 0 ? 'block' : 'none';
        uninstallItem.textContent = 'Uninstall (' + contextMenuBulkUninstallIds.length + ')';
        applyAllItem.textContent = 'Apply to All Profiles (' + contextMenuBulkApplyAllIds.length + ')';
        copyIdItem.textContent = 'Copy ID (' + targets.length + ')';
        addToGroupItem.textContent = 'Add to group ▸ (' + targets.length + ')';
      } else {
        // Built-in (System) extensions cannot be uninstalled or scoped to all profiles.
        // Disabled extensions aren't in vscode.extensions.all, so there's no public API to
        // resolve the install location the toggle command requires - see ADR-004.
        const { isSystem, isDisabled, appliesToAll } = cardEligibility(card);
        uninstallItem.style.display = isSystem ? 'none' : 'block';
        applyAllItem.style.display = (isSystem || isDisabled) ? 'none' : 'block';
        uninstallItem.textContent = 'Uninstall';
        applyAllItem.textContent = (appliesToAll ? '✓ ' : '') + 'Apply to All Profiles';
        copyIdItem.textContent = 'Copy ID';
        addToGroupItem.textContent = 'Add to group ▸';
      }

      contextMenu.style.left = event.clientX + 'px';
      contextMenu.style.top = event.clientY + 'px';
      contextMenu.classList.add('open');
    });
  });

  const menuMain = contextMenu.querySelector('.menu-main');
  const menuGroups = contextMenu.querySelector('.menu-groups');
  const groupsList = contextMenu.querySelector('.groups-list');
  const newGroupInput = contextMenu.querySelector('.new-group-input');
  const menuProfiles = contextMenu.querySelector('.menu-profiles');
  const profilesList = contextMenu.querySelector('.profiles-list');

  function showMainMenu() {
    menuMain.style.display = 'block';
    menuGroups.classList.remove('open');
    menuProfiles.classList.remove('open');
  }

  // Each extension belongs to at most one custom group, so "Add to group" is really "Move
  // to group": clicking a group name moves every target id there, removing it from whatever
  // group it was in before (server-side, in GridState.moveToGroup). Single- and bulk-mode
  // share this same move-only UI; the only difference is how many ids move.
  function renderGroupsList() {
    const names = Object.keys(customGroups).sort();
    const targetIds = contextMenuBulkIds || [contextMenuExtensionId];
    // Only meaningful for a single extension - several selected ones could each already be
    // in a different group (or none), so there's no one "current" state worth marking.
    const currentGroup = contextMenuBulkIds ? undefined : names.find((name) => (customGroups[name] || []).includes(contextMenuExtensionId));
    const groupButtonsHtml = names.map((name) => {
      const safeName = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const marker = name === currentGroup ? '✓ ' : '';
      return '<button class="group-move-button" data-group="' + safeName + '">' + marker + safeName + '</button>';
    }).join('');
    const noGroupsHtml = names.length === 0 ? '<div class="no-groups">No groups yet</div>' : '';
    groupsList.innerHTML = groupButtonsHtml + noGroupsHtml
      + '<hr><button class="group-move-button group-remove" data-group="">Remove from group</button>';
    groupsList.querySelectorAll('.group-move-button').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const group = button.getAttribute('data-group');
        vscode.postMessage({ type: 'moveToGroup', group: group === '' ? null : group, ids: targetIds });
        contextMenu.classList.remove('open');
        if (contextMenuBulkIds) {
          clearSelection();
        }
      });
    });
  }

  // Lists the profiles found in storage.json (see ADR-008) - clicking one copies every
  // target extension's shared install-state entry into that profile's own extensions.json.
  // No per-profile "already there" markers: unlike custom groups, membership across
  // profiles isn't mutually exclusive, and checking would mean reading every listed
  // profile's own file just to render the menu. The result message after the action
  // reports what actually happened instead.
  function renderProfilesList() {
    const targetIds = contextMenuBulkIds || [contextMenuExtensionId];
    const profileButtonsHtml = customProfiles.map((profile) => {
      const safeName = profile.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const safeLocation = profile.location.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return '<button class="profile-add-button" data-location="' + safeLocation + '">' + safeName + '</button>';
    }).join('');
    profilesList.innerHTML = profileButtonsHtml || '<div class="no-profiles">No other profiles found</div>';
    profilesList.querySelectorAll('.profile-add-button').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        vscode.postMessage({ type: 'addToProfile', profileLocation: button.getAttribute('data-location'), ids: targetIds });
        contextMenu.classList.remove('open');
        if (contextMenuBulkIds) {
          clearSelection();
        }
      });
    });
  }

  document.addEventListener('click', () => {
    contextMenu.classList.remove('open');
    showMainMenu();
  });

  contextMenu.querySelectorAll('.menu-back').forEach((backButton) => {
    backButton.addEventListener('click', (event) => {
      event.stopPropagation();
      showMainMenu();
    });
  });

  contextMenu.querySelector('.new-group-add').addEventListener('click', (event) => {
    event.stopPropagation();
    const name = newGroupInput.value.trim();
    if (!name) {
      return;
    }
    const targetIds = contextMenuBulkIds || [contextMenuExtensionId];
    vscode.postMessage({ type: 'moveToGroup', group: name, ids: targetIds });
    if (contextMenuBulkIds) {
      clearSelection();
    }
    newGroupInput.value = '';
    contextMenu.classList.remove('open');
  });

  contextMenu.querySelectorAll('.menu-main [data-menu-action]').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = contextMenuExtensionId;
      const bulkIds = contextMenuBulkIds;
      if (!id) {
        return;
      }
      const action = item.getAttribute('data-menu-action');
      if (action === 'open') {
        vscode.postMessage({ type: 'openExtension', id });
      } else if (action === 'uninstall') {
        if (bulkIds) {
          vscode.postMessage({ type: 'bulkUninstallExtensions', ids: contextMenuBulkUninstallIds });
          clearSelection();
        } else {
          vscode.postMessage({ type: 'uninstallExtension', id });
        }
      } else if (action === 'apply-to-all-profiles') {
        if (bulkIds) {
          vscode.postMessage({ type: 'bulkApplyToAllProfiles', ids: contextMenuBulkApplyAllIds });
          clearSelection();
        } else {
          vscode.postMessage({ type: 'toggleApplyToAllProfiles', id });
        }
      } else if (action === 'copy-id') {
        if (bulkIds) {
          vscode.postMessage({ type: 'bulkCopyExtensionId', ids: bulkIds });
        } else {
          vscode.postMessage({ type: 'copyExtensionId', id });
        }
      } else if (action === 'add-to-group') {
        renderGroupsList();
        menuMain.style.display = 'none';
        menuGroups.classList.add('open');
        return;
      } else if (action === 'add-to-profile') {
        renderProfilesList();
        menuMain.style.display = 'none';
        menuProfiles.classList.add('open');
        return;
      }
      contextMenu.classList.remove('open');
    });
  });

  const menuButton = document.querySelector('.toolbar-button[data-menu="categories"]');
  const menu = document.querySelector('.category-menu');
  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && event.target !== menuButton) {
      menu.classList.remove('open');
    }
  });

  function updateSectionEmptyState() {
    document.querySelectorAll('.group-section').forEach((section) => {
      const visibleCount = Array.from(section.querySelectorAll('.card'))
        .filter((card) => !card.classList.contains('hidden') && !card.classList.contains('search-hidden')).length;
      section.classList.toggle('section-empty', visibleCount === 0);
      const countLabel = section.querySelector('.group-count');
      if (countLabel) {
        countLabel.textContent = '(' + visibleCount + ')';
      }
    });
  }

  function applyCategoryVisibility() {
    const hidden = new Set(Array.from(menu.querySelectorAll('input[type="checkbox"]:not(:checked)'))
      .map((checkbox) => checkbox.getAttribute('data-category')));
    document.querySelectorAll('.card').forEach((card) => {
      const categories = card.getAttribute('data-categories').split('|');
      // Mirrors renderCard's server-side hidden computation - System is a blanket override,
      // not just another category to intersect with the rest.
      const isSystemHidden = categories.includes(SYSTEM_CATEGORY) && hidden.has(SYSTEM_CATEGORY);
      const allHidden = categories.every((category) => hidden.has(category));
      card.classList.toggle('hidden', isSystemHidden || allHidden);
    });
    updateSectionEmptyState();
  }

  menu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const category = checkbox.getAttribute('data-category');
      applyCategoryVisibility();
      vscode.postMessage({ type: 'setCategoryHidden', category, hidden: !checkbox.checked });
    });
  });

  menu.querySelector('.show-all').addEventListener('click', () => {
    menu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.checked = true; });
    applyCategoryVisibility();
    vscode.postMessage({ type: 'showAllCategories' });
  });

  const groupBySelect = document.querySelector('.toolbar-select[data-action="group-by"]');
  groupBySelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'setGroupBy', groupBy: groupBySelect.value });
  });

  const measureButton = document.querySelector('.toolbar-button[data-action="measure-startup"]');
  if (measureButton) {
    measureButton.addEventListener('click', () => {
      measureButton.textContent = 'Measuring…';
      measureButton.disabled = true;
      vscode.postMessage({ type: 'measureStartup' });
    });
  }

  document.querySelector('.toolbar-button[data-action="switch-profile"]').addEventListener('click', () => {
    vscode.postMessage({ type: 'switchProfile' });
  });

  // Re-rendering replaces the whole document (webview.html is rebuilt on every state
  // change, including background extension changes), so filter text and scroll position
  // are persisted via the webview state API and restored on load.
  const filterInput = document.querySelector('.filter-input');

  function applyFilter() {
    const query = filterInput.value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach((card) => {
      const matches = query === '' || card.getAttribute('data-search').includes(query);
      card.classList.toggle('search-hidden', !matches);
    });
    updateSectionEmptyState();
  }

  function saveViewState() {
    vscode.setState({ filter: filterInput.value, scrollY: window.scrollY, checkedIds: Array.from(checkedIds) });
  }

  filterInput.addEventListener('input', () => {
    applyFilter();
    saveViewState();
  });
  window.addEventListener('scroll', saveViewState);

  const savedState = vscode.getState();
  if (savedState && savedState.filter) {
    filterInput.value = savedState.filter;
  }
  if (savedState && savedState.checkedIds) {
    savedState.checkedIds.forEach((id) => checkedIds.add(id));
    document.querySelectorAll('.card').forEach((card) => {
      setCardChecked(card, checkedIds.has(card.getAttribute('data-extension-id')));
    });
    updateSelectingClass();
  }
  applyFilter();
  if (savedState && savedState.scrollY) {
    window.scrollTo(0, savedState.scrollY);
  }
</script>
</body>
</html>`;
}

function createNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function renderToolbar(categories: string[], hiddenCategories: Set<string>, groupBy: GroupByMode): string {
    const items = categories.map((category) => {
        const checked = hiddenCategories.has(category) ? '' : 'checked';
        return `<label>
    <input type="checkbox" data-category="${escapeHtml(category)}" ${checked}>
    ${escapeHtml(category)}
</label>`;
    }).join('\n');
    const options: [GroupByMode, string][] = [
        ['category', 'Category'],
        ['alphabetical', 'Alphabetical'],
        ['enabled', 'Enabled / Disabled'],
        ['startup', 'Startup Time'],
        ['custom', 'My Groups'],
        ['none', 'None']
    ];
    const optionsHtml = options
        .map(([value, label]) => `<option value="${value}" ${groupBy === value ? 'selected' : ''}>${label}</option>`)
        .join('\n');
    const measureButton = groupBy === 'startup'
        ? '<button class="toolbar-button" data-action="measure-startup" title="Runs Developer: Startup Performance and reads its report">Measure Startup</button>'
        : '';
    return `<div class="toolbar">
    <input type="text" class="filter-input" placeholder="Filter extensions...">
    <button class="toolbar-button" data-menu="categories">Categories ▾</button>
    <select class="toolbar-select" data-action="group-by" title="Group by">
        ${optionsHtml}
    </select>
    ${measureButton}
    <button class="toolbar-button" data-action="switch-profile" title="Open VS Code's native Switch Profile picker">Switch Profile...</button>
    <div class="category-menu">
        <button class="show-all">Show all</button>
        <hr>
        ${items}
    </div>
</div>`;
}

function renderGroupSection(
    webview: vscode.Webview,
    group: Group,
    hiddenCategories: Set<string>,
    startupTimings: Map<string, StartupTiming> | undefined,
    pendingUninstalls: Set<string>
): string {
    const heading = group.label
        ? `<h2>${escapeHtml(group.label)} <span class="group-count"></span></h2>`
        : '';
    const cards = group.extensions.map((ext) => renderCard(webview, ext, hiddenCategories, startupTimings, pendingUninstalls)).join('\n');
    return `<div class="group-section">
    ${heading}
    <div class="grid">
${cards}
    </div>
</div>`;
}

function renderCard(
    webview: vscode.Webview,
    ext: ExtensionCardData,
    hiddenCategories: Set<string>,
    startupTimings: Map<string, StartupTiming> | undefined,
    pendingUninstalls: Set<string>
): string {
    const iconSrc = ext.iconPath ? webview.asWebviewUri(ext.iconPath).toString() : undefined;
    // codicon-extensions-large is the exact glyph VS Code's own extensions view uses as the
    // default icon (Codicon.extensionsLarge, see extensionsIcons.ts) - not an approximation.
    const icon = iconSrc ? `<img src="${iconSrc}" alt="">` : '<span class="icon-placeholder codicon codicon-extensions-large"></span>';
    // System is a blanket "hide built-ins" toggle (ADR-003), not just another category to
    // intersect: a built-in extension usually also carries a real category (e.g. "Programming
    // Languages"), so requiring every category to be hidden would never hide it via System alone.
    const isSystemHidden = ext.categories.includes(SYSTEM_CATEGORY) && hiddenCategories.has(SYSTEM_CATEGORY);
    const allCategoriesHidden = ext.categories.every((category) => hiddenCategories.has(category));
    const hiddenClass = (isSystemHidden || allCategoriesHidden) ? ' hidden' : '';
    const searchText = `${ext.displayName} ${ext.id} ${ext.description}`.toLowerCase();
    const categoriesAttr = ext.categories.map(escapeHtml).join('|');
    const pending = pendingUninstalls.has(ext.id.toLowerCase());
    const statusClass = pending
        ? ' status-pending-uninstall'
        : (ext.enabled ? ' status-enabled' : ' status-disabled');
    const pendingBadge = pending ? '<span class="pending-badge">uninstalled — reload to apply</span>' : '';
    const timing = startupTimings?.get(ext.id.toLowerCase());
    const timingBadge = timing ? `<span class="timing">${timing.totalMs}ms</span>` : '';
    const allProfilesBadge = ext.appliesToAllProfiles
        ? '<span class="all-profiles-badge" title="Applies to all profiles">All Profiles</span>' : '';
    return `<div class="card${hiddenClass}${statusClass}" data-extension-id="${escapeHtml(ext.id)}" data-categories="${categoriesAttr}" data-search="${escapeHtml(searchText)}" data-all-profiles="${ext.appliesToAllProfiles}">
    <div class="icon-col">
        ${icon}
        <input type="checkbox" class="card-checkbox" title="Select for multi-item actions">
    </div>
    <div class="name"><span class="name-text">${escapeHtml(ext.displayName)}</span>${pendingBadge}${timingBadge}${allProfilesBadge}</div>
    <div class="desc">${escapeHtml(ext.description)}</div>
</div>`;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            default: return '&#39;';
        }
    });
}
