import type { GitCommitNode } from "@an-dr/commits-core/backend/types";
import { beforeEach, describe, expect, it } from "vitest";

import { Graph } from "@/webview/graph";

const config: Config = {
  autoCenterCommitDetailsView: true,
  committedVisual: "Avatar",
  avatarMode: "Auto (Fetched then Pattern)",
  avatarSize: "Normal",
  avatarShape: "Circle",
  fetchAvatars: false,
  graphColours: ["#0085d9", "#d9008f", "#00d90a"],
  graphStyle: "rounded",
  grid: { x: 16, y: 24, offsetX: 8, offsetY: 12, expandY: 250 },
  initialLoadCommits: 300,
  loadMoreCommits: 75,
  showCurrentBranchByDefault: false
};

function makeCommit(hash: string, parentHashes: string[] = []): GitCommitNode {
  return {
    hash,
    parentHashes,
    author: "Author",
    email: "author@example.com",
    date: 1700000000,
    message: hash,
    refs: []
  };
}

function createGraph() {
  document.body.innerHTML = '<div id="graph"></div>';
  const graph = new Graph("graph", config);
  const svg = document.querySelector("#graph svg")!;
  return { graph, svg };
}

function loadGraph(
  graph: Graph,
  commits: GitCommitNode[],
  head: string | null = commits[0]?.hash ?? null
) {
  graph.loadCommits(
    commits,
    head,
    Object.fromEntries(commits.map((commit, index) => [commit.hash, index]))
  );
  graph.render(null);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Graph", () => {
  it("renders an empty graph with zero dimensions", () => {
    const { graph, svg } = createGraph();
    loadGraph(graph, []);

    expect(graph.getWidth()).toBe(0);
    expect(graph.getHeight(null)).toBe(0);
    expect(svg.getAttribute("width")).toBe("0");
    expect(svg.querySelectorAll("circle, path.line")).toHaveLength(0);
  });

  it("renders one current commit as a single graph vertex", () => {
    const { graph, svg } = createGraph();
    loadGraph(graph, [makeCommit("one")]);

    expect(graph.getWidth()).toBe(16);
    expect(graph.getHeight(null)).toBe(24);
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector("circle")?.getAttribute("class")).toBe("current");
  });

  it("renders a linear commit chain on one colour", () => {
    const { graph, svg } = createGraph();
    loadGraph(graph, [
      makeCommit("head", ["middle"]),
      makeCommit("middle", ["root"]),
      makeCommit("root")
    ]);

    expect(svg.querySelectorAll("circle")).toHaveLength(3);
    expect(svg.querySelectorAll("path.line")).toHaveLength(1);
    expect(new Set([0, 1, 2].map((index) => graph.getVertexColour(index))).size).toBe(1);
  });

  it("renders a branch and merge with all vertices and connecting paths", () => {
    const { graph, svg } = createGraph();
    loadGraph(graph, [
      makeCommit("merge", ["left", "right"]),
      makeCommit("left", ["root"]),
      makeCommit("right", ["root"]),
      makeCommit("root")
    ]);

    expect(svg.querySelectorAll("circle")).toHaveLength(4);
    expect(svg.querySelectorAll("path.line").length).toBeGreaterThan(1);
    expect(
      Array.from(svg.querySelectorAll("path.line")).every((path) => path.getAttribute("d") !== "")
    ).toBe(true);
  });

  it("assigns stable vertex colours within the configured palette", () => {
    const { graph } = createGraph();
    loadGraph(graph, [
      makeCommit("merge", ["left", "right"]),
      makeCommit("left", ["root"]),
      makeCommit("right", ["root"]),
      makeCommit("root")
    ]);

    const colours = [0, 1, 2, 3].map((index) => graph.getVertexColour(index));
    expect(colours).toEqual([0, 1, 2, 3].map((index) => graph.getVertexColour(index)));
    expect(colours.every((colour) => colour >= 0 && colour < config.graphColours.length)).toBe(
      true
    );
  });

  // limitMaxWidth drives a gradient fade at the right edge; it deliberately
  // does not clamp getWidth(), which reports the graph its intrinsic width.
  it("keeps the intrinsic width and applies a fade when a maximum is set", () => {
    const { graph } = createGraph();
    loadGraph(graph, [
      makeCommit("merge", ["left", "right"]),
      makeCommit("left", ["root"]),
      makeCommit("right", ["root"]),
      makeCommit("root")
    ]);
    graph.limitMaxWidth(16);

    expect(graph.getWidth()).toBeGreaterThan(0);
    const stops = document.querySelectorAll("stop");
    expect(stops.length).toBeGreaterThan(0);
    expect(Number(stops[0].getAttribute("offset"))).toBeLessThan(1);
  });

  it("treats a negative width limit as unlimited", () => {
    const { graph } = createGraph();
    loadGraph(graph, [
      makeCommit("merge", ["left", "right"]),
      makeCommit("left", ["root"]),
      makeCommit("right", ["root"]),
      makeCommit("root")
    ]);
    const width = graph.getWidth();

    graph.limitMaxWidth(-1);
    expect(graph.getWidth()).toBe(width);
  });

  it("clears existing SVG geometry before loading a fresh graph", () => {
    const { graph, svg } = createGraph();
    loadGraph(graph, [makeCommit("head", ["root"]), makeCommit("root")]);
    graph.clear();

    expect(svg.querySelectorAll("g")).toHaveLength(0);
    expect(svg.getAttribute("width")).toBe("0");
    loadGraph(graph, [makeCommit("fresh")]);
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
  });

  it("replaces instead of duplicating SVG geometry on repeated renders", () => {
    const { graph, svg } = createGraph();
    graph.loadCommits([makeCommit("head", ["root"]), makeCommit("root")], "head", {
      head: 0,
      root: 1
    });
    graph.render(null);
    graph.render(null);

    expect(svg.querySelectorAll("g")).toHaveLength(1);
    expect(svg.querySelectorAll("circle")).toHaveLength(2);
  });
});
