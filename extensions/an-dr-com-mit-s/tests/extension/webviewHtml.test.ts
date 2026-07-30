import { describe, expect, it } from "vitest";

import { buildWebviewHtml } from "@/extension/webviewHtml";

import { createWebviewStub } from "./__mocks__/vscode";

/**
 * The config surface `buildWebviewHtml` reads. Declared as a partial rather
 * than cast through `unknown`, so adding a config dependency fails this file
 * at compile time instead of at runtime.
 */
function makeConfig(overrides: Record<string, unknown> = {}) {
  const base = {
    autoCenterCommitDetailsView: () => true,
    committedVisual: () => "Avatar",
    avatarMode: () => "Auto (Fetched then Pattern)",
    avatarSize: () => "Normal",
    avatarShape: () => "Circle",
    dateFormat: () => "Date & Time",
    fetchAvatars: () => false,
    graphColours: () => ["#0085d9", "#d9008f"],
    graphStyle: () => "rounded",
    initialLoadCommits: () => 300,
    loadMoreCommits: () => 75,
    showCurrentBranchByDefault: () => false,
    uiDensity: () => "Normal",
    columnVisibility: () => ({ Committed: true, ID: true })
  };
  return { ...base, ...overrides };
}

function build(
  options: { repos?: Record<string, unknown>; config?: Record<string, unknown> } = {}
) {
  const repos = options.repos ?? { "/ws/a": { columnWidths: null } };
  return buildWebviewHtml({
    webview: createWebviewStub() as never,
    config: makeConfig(options.config) as never,
    extensionPath: "/ext",
    extensionState: {
      getLastActiveRepo: () => "/ws/a",
      isAvatarStorageAvailable: () => true
    } as never,
    repoManager: { getRepos: () => repos } as never
  });
}

describe("buildWebviewHtml", () => {
  it("reports the graph as loaded only when a repository exists", () => {
    expect(build().isGraphLoaded).toBe(true);
    expect(build({ repos: {} }).isGraphLoaded).toBe(false);
  });

  it("renders the graph body when a repository exists", () => {
    const { html } = build();
    expect(html).toContain('id="commitGraph"');
    expect(html).toContain('id="commitTable"');
    // Match the body class, not the bare word: an l10n key embedded in the
    // page is also called unableToLoadCommitDetails.
    expect(html).not.toContain('<body class="unableToLoad"');
  });

  it("renders the unable-to-load body when no repository exists", () => {
    const { html } = build({ repos: {} });
    expect(html).toContain('<body class="unableToLoad"');
    expect(html).not.toContain('id="commitTable"');
  });

  it("locks the content security policy to the webview's own source", () => {
    const { html } = build();
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("vscode-webview://test");
  });

  it("uses one nonce for every inline script, and a fresh one each build", () => {
    const { html } = build();
    const nonces = [...html.matchAll(/nonce="([^"]+)"/g)].map((m) => m[1]);

    expect(nonces.length).toBeGreaterThan(1);
    expect(new Set(nonces).size).toBe(1);
    expect(html).toContain(`'nonce-${nonces[0]}'`);

    const second = [...build().html.matchAll(/nonce="([^"]+)"/g)].map((m) => m[1]);
    expect(second[0]).not.toBe(nonces[0]);
  });

  it("rewrites local resources into webview URIs", () => {
    const { html } = build();
    expect(html).toContain("https://file+.vscode-resource/");
    expect(html).toContain("web.min.js");
  });

  it("embeds the view state as JSON the webview can read", () => {
    const { html } = build();
    const match = html.match(/var viewState = (\{.*?\});<\/script>/s);
    expect(match).not.toBeNull();

    const state = JSON.parse(
      match![1]
        .replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">")
        .replace(/\\u0026/g, "&")
    );
    expect(state.repos).toEqual({ "/ws/a": { columnWidths: null } });
    expect(state.lastActiveRepo).toBe("/ws/a");
    expect(state.avatarMode).toBe("Auto (Fetched then Pattern)");
  });

  it("escapes angle brackets in embedded state so a repo name cannot close the script tag", () => {
    const { html } = build({ repos: { "/ws/</script><script>alert(1)</script>": {} } });

    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c");
  });

  it("disables avatar fetching when the storage folder is unavailable", () => {
    const html = buildWebviewHtml({
      webview: createWebviewStub() as never,
      config: makeConfig({ fetchAvatars: () => true }) as never,
      extensionPath: "/ext",
      extensionState: {
        getLastActiveRepo: () => null,
        isAvatarStorageAvailable: () => false
      } as never,
      repoManager: { getRepos: () => ({ "/ws/a": {} }) } as never
    }).html;

    expect(html).toMatch(/"fetchAvatars":\s*false/);
  });

  it("emits a CSS variable and selector for each graph colour", () => {
    const { html } = build({ config: { graphColours: () => ["#111111", "#222222", "#333333"] } });

    expect(html).toContain("--git-graph-color0:#111111");
    expect(html).toContain("--git-graph-color2:#333333");
    expect(html).toContain('[data-color="2"]');
  });
});
