import type { BranchPanelRenderModel, BranchPanelRenderOption } from "./branchPanel";
import { escapeHtml } from "./utils/html";
import { svgIcons } from "./utils/icons";

type BranchTreeNode = BranchTreeFolder | BranchTreeLeaf;

interface BranchTreeFolder {
  type: "folder";
  name: string;
  path: string;
  children: BranchTreeNode[];
}

interface BranchTreeLeaf {
  type: "leaf";
  displayName: string;
  fullName: string;
  option: BranchPanelRenderOption;
}

function insertNode(
  nodes: BranchTreeNode[],
  parts: string[],
  option: BranchPanelRenderOption,
  pathPrefix: string
): void {
  const segment = parts[0];
  const path = pathPrefix === "" ? segment : `${pathPrefix}/${segment}`;
  if (parts.length === 1) {
    nodes.push({ type: "leaf", displayName: segment, fullName: option.name, option });
    return;
  }

  let folder = nodes.find(
    (node): node is BranchTreeFolder => node.type === "folder" && node.name === segment
  );
  if (!folder) {
    folder = { type: "folder", name: segment, path, children: [] };
    nodes.push(folder);
  }
  insertNode(folder.children, parts.slice(1), option, path);
}

function buildTree(options: readonly BranchPanelRenderOption[]): BranchTreeNode[] {
  const root: BranchTreeNode[] = [];
  for (const option of options) {
    insertNode(root, option.name.split("/"), option, "");
  }
  return root;
}

function sortTree(nodes: BranchTreeNode[]): BranchTreeNode[] {
  for (const node of nodes) {
    if (node.type === "folder") {
      sortTree(node.children);
    }
  }
  return nodes.toSorted((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1;
    }
    const leftName = left.type === "folder" ? left.name : left.displayName;
    const rightName = right.type === "folder" ? right.name : right.displayName;
    return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
  });
}

function renderItem(option: BranchPanelRenderOption, name: string, indent: number): string {
  const classes = ["branchPanelItem"];
  if (option.selected) {
    classes.push("selected");
  }
  if (option.current) {
    classes.push("currentBranch");
  }
  return `<div class="${classes.join(" ")}" data-value="${escapeHtml(option.value)}" title="${escapeHtml(option.name)}" style="padding-left:${4 + indent * 14}px">
    <span class="branchPanelCheck">${option.selected ? "✓" : ""}</span>
    <span class="branchPanelItemName">${escapeHtml(name)}</span>
    ${option.current ? '<span class="branchPanelCurrentBadge">HEAD</span>' : ""}
  </div>`;
}

function renderTree(
  nodes: readonly BranchTreeNode[],
  indent: number,
  collapsed: ReadonlySet<string>
): string {
  let html = "";
  for (const node of nodes) {
    if (node.type === "leaf") {
      html += renderItem(node.option, node.displayName, indent);
      continue;
    }
    const isCollapsed = collapsed.has(node.path);
    html += `<div class="branchPanelFolder" data-folder="${escapeHtml(node.path)}" style="padding-left:${4 + indent * 14}px">
      <span class="branchPanelFolderIcon">${isCollapsed ? svgIcons.closedFolder : svgIcons.openFolder}</span>
      <span class="branchPanelFolderName">${escapeHtml(node.name)}/</span>
    </div>`;
    if (!isCollapsed) {
      html += renderTree(node.children, indent + 1, collapsed);
    }
  }
  return html;
}

function renderSection(
  label: string,
  options: readonly BranchPanelRenderOption[],
  collapsed: ReadonlySet<string>
): string {
  if (options.length === 0) {
    return "";
  }
  return `<div class="branchPanelSectionHeader">${escapeHtml(label)} (${options.length})</div>${renderTree(
    sortTree(buildTree(options)),
    1,
    collapsed
  )}`;
}

/** Builds the branch-panel list without attaching interaction behavior. */
export function renderBranchPanel(model: BranchPanelRenderModel): string {
  if (model.options.length === 0) {
    return `<div class="branchPanelEmpty">${escapeHtml(l10n.branchPanelNoBranches)}</div>`;
  }

  const filter = model.filter.trim().toLocaleLowerCase();
  const matches = (option: BranchPanelRenderOption) =>
    filter === "" || option.name.toLocaleLowerCase().includes(filter);
  const showAll = model.options.find(
    (option) =>
      option.value === "" && (filter === "" || l10n.showAll.toLocaleLowerCase().includes(filter))
  );
  const locals = model.options.filter(
    (option) => option.value !== "" && !option.value.startsWith("remotes/") && matches(option)
  );
  const remotes = model.options
    .filter((option) => option.value.startsWith("remotes/") && matches(option))
    .map((option) => ({
      name: option.value.slice("remotes/".length),
      value: option.value,
      selected: option.selected,
      current: option.current
    }));

  return (
    (showAll ? renderItem(showAll, showAll.name, 0) : "") +
      renderSection(l10n.branchPanelLocal, locals, model.collapsedFolders) +
      renderSection(l10n.branchPanelRemote, remotes, model.collapsedFolders) ||
    `<div class="branchPanelEmpty">${escapeHtml(l10n.branchPanelNoMatchingBranches)}</div>`
  );
}
