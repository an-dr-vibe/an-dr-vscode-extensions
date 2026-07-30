import { describe, expect, it } from "vitest";

import {
  EXTENSION_ID,
  getCommandId,
  getConfigKey,
  getVersionedStateKey,
  getVirtualDocumentScheme,
  shouldReadStagingLegacyState,
  STAGING_EXTENSION_ID,
  TARGET_EXTENSION_ID
} from "@/extension/constant/const";

describe("extension identity", () => {
  it("keeps staging and target identities distinct until cutover", () => {
    expect(EXTENSION_ID).toBe(STAGING_EXTENSION_ID);
    expect(STAGING_EXTENSION_ID).not.toBe(TARGET_EXTENSION_ID);
    expect(getCommandId("view")).toBe("an-dr-com-mit-s.view");
    expect(getCommandId("view", TARGET_EXTENSION_ID)).toBe("an-dr-commits.view");
    expect(getConfigKey("statusBarIconOnly")).toBe("an-dr-com-mit-s.statusBarIconOnly");
    expect(getVirtualDocumentScheme()).toBe("an-dr-com-mit-s");
  });

  it("isolates replacement state from legacy state keys", () => {
    expect(getVersionedStateKey("repoStates")).toBe("v2.repoStates");
    expect(getVersionedStateKey("lastActiveRepo")).toBe("v2.lastActiveRepo");
    expect(shouldReadStagingLegacyState()).toBe(true);
    expect(shouldReadStagingLegacyState(TARGET_EXTENSION_ID)).toBe(false);
  });
});
