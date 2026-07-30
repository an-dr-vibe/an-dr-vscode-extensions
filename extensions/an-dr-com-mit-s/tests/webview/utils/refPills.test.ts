import { describe, expect, it } from "vitest";

import { renderTagPill } from "@/webview/utils/refPills";

describe("renderTagPill", () => {
  it("renders the shared .gitRef.tag markup contract", () => {
    const html = renderTagPill("v1.0.0");
    expect(html).toContain('class="gitRef tag"');
    expect(html).toContain('data-name="v1.0.0"');
    expect(html).toContain('data-drag-ref-type="tag"');
    expect(html).toContain('data-fullref="v1.0.0"');
  });

  it("escapes names so a tag cannot inject markup", () => {
    const html = renderTagPill('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes the tooltip too", () => {
    const html = renderTagPill("v1", { title: '"><script>' });
    expect(html).not.toContain("<script>");
  });

  it("adds the compact class only when asked", () => {
    expect(renderTagPill("v1", { compact: true })).toContain('class="gitRef tag compact"');
    expect(renderTagPill("v1")).toContain('class="gitRef tag"');
  });

  it("emits data-tagtype and draggable only when supplied", () => {
    const full = renderTagPill("v1", { tagType: "annotated", draggable: true });
    expect(full).toContain('data-tagtype="annotated"');
    expect(full).toContain('draggable="true"');

    const bare = renderTagPill("v1");
    expect(bare).not.toContain("data-tagtype");
    expect(bare).not.toContain("draggable");
  });

  it("defaults the tooltip to the tag name", () => {
    expect(renderTagPill("v1")).toContain('title="Tag: v1"');
  });
});
