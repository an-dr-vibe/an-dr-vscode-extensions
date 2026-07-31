import type { RepoInProgressState } from "@an-dr/commits-core/backend/queries/repoInProgress";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoInProgressBanner } from "@/webview/repoInProgressBanner";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

function state(overrides: Partial<RepoInProgressState> = {}): RepoInProgressState {
  return {
    type: "rebase",
    subject: null,
    rebaseProgress: null,
    rebaseContext: null,
    workingTreeStatus: null,
    ...overrides
  };
}

function banner(): HTMLElement {
  return document.getElementById("repoInProgressBanner")!;
}

function primary(): string {
  return document.getElementById("repoInProgressBannerPrimary")!.textContent ?? "";
}

function secondary(): string {
  return document.getElementById("repoInProgressBannerSecondary")!.textContent ?? "";
}

describe("repo in-progress banner", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  it("stays inactive for a repository in a normal state", () => {
    const view = new RepoInProgressBanner(vi.fn());
    view.render(null);

    expect(view.isActive()).toBe(false);
    expect(banner().classList.contains("active")).toBe(false);
  });

  it.each([
    ["rebase", "Rebase"],
    ["merge", "Merge"],
    ["cherry-pick", "Cherry-pick"],
    ["revert", "Revert"]
  ] as const)("names a %s", (type, label) => {
    const view = new RepoInProgressBanner();
    view.render(state({ type }));

    expect(view.isActive()).toBe(true);
    expect(primary()).toContain(label);
  });

  it("shows rebase progress alongside the name", () => {
    const view = new RepoInProgressBanner();
    view.render(state({ rebaseProgress: { current: 2, total: 5 } }));

    expect(primary()).toContain("Rebase (2/5)");
  });

  it("clears itself when the operation finishes", () => {
    const view = new RepoInProgressBanner();
    view.render(state({ type: "merge" }));
    view.render(null);

    expect(view.isActive()).toBe(false);
    expect(primary()).toBe("");
    expect(secondary()).toBe("");
  });

  describe("working tree summary", () => {
    it("reports a clean tree", () => {
      const view = new RepoInProgressBanner();
      view.render(
        state({ workingTreeStatus: { changed: 0, staged: 0, conflicts: 0, untracked: 0 } })
      );

      expect(secondary()).toContain("clean");
    });

    it("lists each non-zero count", () => {
      const view = new RepoInProgressBanner();
      view.render(
        state({ workingTreeStatus: { changed: 2, staged: 1, conflicts: 3, untracked: 4 } })
      );

      expect(secondary()).toContain("2 changed");
      expect(secondary()).toContain("1 staged");
      expect(secondary()).toContain("3 conflicts");
      expect(secondary()).toContain("4 untracked");
    });

    it("marks the banner conflicted only when a path is unmerged", () => {
      // The conflicted styling is what tells the user the operation is
      // blocked, so an untracked file alone must not trigger it.
      const view = new RepoInProgressBanner();

      view.render(
        state({ workingTreeStatus: { changed: 0, staged: 0, conflicts: 0, untracked: 9 } })
      );
      expect(banner().classList.contains("conflicted")).toBe(false);

      view.render(
        state({ workingTreeStatus: { changed: 0, staged: 0, conflicts: 1, untracked: 0 } })
      );
      expect(banner().classList.contains("conflicted")).toBe(true);
    });

    it("stops being conflicted once the conflict is resolved", () => {
      const view = new RepoInProgressBanner();
      view.render(
        state({ workingTreeStatus: { changed: 0, staged: 0, conflicts: 1, untracked: 0 } })
      );
      view.render(
        state({ workingTreeStatus: { changed: 1, staged: 0, conflicts: 0, untracked: 0 } })
      );

      expect(banner().classList.contains("conflicted")).toBe(false);
    });
  });

  describe("rebase context", () => {
    it("names the branch and what it is replayed onto", () => {
      const view = new RepoInProgressBanner();
      view.render(state({ rebaseContext: { branch: "feature", onto: "main" } }));

      expect(secondary()).toContain("rebasing feature onto main");
    });

    it("names only what is known", () => {
      const view = new RepoInProgressBanner();

      view.render(state({ rebaseContext: { branch: "feature", onto: null } }));
      expect(secondary()).toContain("rebasing feature");

      view.render(state({ rebaseContext: { branch: null, onto: "main" } }));
      expect(secondary()).toContain("rebasing onto main");
    });
  });

  it("appends the commit subject", () => {
    const view = new RepoInProgressBanner();
    view.render(state({ type: "cherry-pick", subject: "Add the banner" }));

    expect(secondary()).toContain("cherry-pick: Add the banner");
  });

  it("does not let a commit subject inject markup", () => {
    // The subject comes from the repository, so it is rendered as text.
    const view = new RepoInProgressBanner();
    view.render(state({ subject: "<img src=x onerror=alert(1)>" }));

    expect(banner().querySelector("img")).toBeNull();
    expect(secondary()).toContain("<img src=x onerror=alert(1)>");
  });

  it("does not let a branch name inject markup", () => {
    const view = new RepoInProgressBanner();
    view.render(state({ rebaseContext: { branch: "<b>x</b>", onto: "main" } }));

    // Scoped to the secondary line: the heading contains an intentional <b>.
    const line = document.getElementById("repoInProgressBannerSecondary")!;
    expect(line.querySelector("b")).toBeNull();
    expect(line.textContent).toContain("<b>x</b>");
  });

  it("dispatches continue and abort for the rendered operation", () => {
    const action = vi.fn();
    const view = new RepoInProgressBanner(action);
    view.render(state({ type: "cherry-pick" }));

    document
      .querySelector<HTMLElement>('[data-action="continue"]')!
      .dispatchEvent(new MouseEvent("click"));
    document
      .querySelector<HTMLElement>('[data-action="abort"]')!
      .dispatchEvent(new MouseEvent("click"));

    expect(action.mock.calls).toEqual([
      ["cherry-pick", "continue"],
      ["cherry-pick", "abort"]
    ]);
  });
});
