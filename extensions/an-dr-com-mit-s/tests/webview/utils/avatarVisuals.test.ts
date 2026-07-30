import { describe, expect, it } from "vitest";

import {
  getAuthorVisual,
  renderAuthorVisualHtml,
  type AvatarConfig
} from "@/webview/utils/avatarVisuals";

const baseConfig: AvatarConfig = {
  committedVisual: "Avatar",
  avatarMode: "Auto (Fetched then Pattern)",
  avatarSize: "Normal",
  avatarShape: "Circle",
  fetchAvatars: true
};

describe("getAuthorVisual", () => {
  it("uses a fetched image in automatic mode", () => {
    expect(
      getAuthorVisual(baseConfig, "Ada", "ada@example.com", "data:image/png;base64,AA")
    ).toEqual({
      image: "data:image/png;base64,AA",
      procedural: false,
      updateOnFetch: true
    });
  });

  it("uses a procedural image while an automatic fetch is pending", () => {
    const visual = getAuthorVisual(baseConfig, "Ada", "ada@example.com", null);
    expect(visual.image).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(visual.procedural).toBe(true);
    expect(visual.updateOnFetch).toBe(true);
  });

  it("uses only fetched images in fetched-only mode", () => {
    expect(
      getAuthorVisual({ ...baseConfig, avatarMode: "Fetched Only" }, "Ada", "ada@example.com", null)
    ).toEqual({ image: null, procedural: false, updateOnFetch: true });
  });

  it("always uses a procedural image in procedural-pattern mode", () => {
    const visual = getAuthorVisual(
      { ...baseConfig, avatarMode: "Procedural Pattern" },
      "Ada",
      "ada@example.com",
      "data:image/png;base64,AA"
    );
    expect(visual.image).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(visual.procedural).toBe(true);
    expect(visual.updateOnFetch).toBe(false);
  });

  it("disables both the image and future fetch updates in disabled mode", () => {
    expect(
      getAuthorVisual({ ...baseConfig, avatarMode: "Disabled" }, "Ada", "ada@example.com", null)
    ).toEqual({ image: null, procedural: false, updateOnFetch: false });
  });
});

describe("renderAuthorVisualHtml", () => {
  it("renders an escaped initials badge instead of an image when configured", () => {
    const html = renderAuthorVisualHtml(
      { ...baseConfig, committedVisual: "Initials", avatarSize: "Small", avatarShape: "Square" },
      '<img src=x onerror="alert(1)">',
      "ada@example.com",
      null
    );

    expect(html).toContain('class="avatar initials square small"');
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).not.toContain('class="avatarImg"');
  });
});
