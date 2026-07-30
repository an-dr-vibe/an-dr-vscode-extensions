/** Extension identifier used while the replacement and current extension coexist. */
export const STAGING_EXTENSION_ID = "an-dr-com-mit-s";

/** Extension identifier adopted only during the final cutover. */
export const TARGET_EXTENSION_ID = "an-dr-commits";

/** Active identifier shared by commands, configuration, and virtual documents. */
export const EXTENSION_ID = STAGING_EXTENSION_ID;

/** Human-readable name displayed by the VS Code user interface. */
export const EXTENSION_NAME = "an-dr: Commits (MIT)";

/** Returns an extension-scoped command identifier. */
export function getCommandId(command: string, extensionId = EXTENSION_ID) {
  return `${extensionId}.${command}`;
}

/** Returns an extension-scoped configuration key. */
export function getConfigKey(key: string, extensionId = EXTENSION_ID) {
  return `${extensionId}.${key}`;
}

/** Returns the virtual-document scheme for an extension identity. */
export function getVirtualDocumentScheme(extensionId = EXTENSION_ID) {
  return extensionId;
}

/** Returns a state key isolated from the legacy extension state shape. */
export function getVersionedStateKey(key: string) {
  return `v2.${key}`;
}

/** Returns whether unversioned workspace state belongs to the active staging identity. */
export function shouldReadStagingLegacyState(extensionId = EXTENSION_ID) {
  return extensionId === STAGING_EXTENSION_ID;
}
