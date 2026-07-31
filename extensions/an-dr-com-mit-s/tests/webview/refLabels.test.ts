import { describe, expect, it } from "vitest";

import { renderTagPill } from "@/webview/utils/refPills";

describe("reference labels", () => {
  it("wraps a tag name so the shared label padding applies", () => {
    const html = renderTagPill("v1.0");

    expect(html).toContain('class="gitRef tag"');
    expect(html).toContain('<span class="gitRefName" data-fullref="v1.0">v1.0</span>');
  });

  it("escapes a tag name in both the attribute and the text", () => {
    const html = renderTagPill('<img src=x>"');

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x&gt;&quot;");
  });
});
