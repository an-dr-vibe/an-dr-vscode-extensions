/** Removes only the extension-owned persistent markers during uninstall. */
const fs = require("fs");
const path = require("path");

const storagePath = process.env.VSCODE_EXTENSION_STORAGE_PATH;
if (storagePath) {
  for (const name of ["avatars", "compatibilityMigrationVersion"]) {
    fs.rmSync(path.join(storagePath, name), { recursive: true, force: true });
  }
}
