#!/usr/bin/env node

/**
 * Validates the public-identity gates before the MIT candidate replaces Commits.
 *
 * The script intentionally fails before any filesystem mutation. It compares
 * only manifest facts that users can observe; implementation provenance is
 * checked separately by check-provenance.js.
 */
const fs = require("fs");
const path = require("path");

const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
const candidateDirectory = path.join(repositoryRoot, "extensions", "an-dr-commits");
const requiredPackageName = "an-dr-commits";
const requiredCommandCount = 9;
const requiredSettingCount = 139;

function readManifest(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
}

function countCommands(manifest) {
  return manifest.contributes?.commands?.length ?? 0;
}

function countSettings(manifest) {
  return Object.keys(manifest.contributes?.configuration?.properties ?? {}).length;
}

function validateCutover() {
  const candidate = readManifest(candidateDirectory);
  const failures = [];

  if (candidate.name !== requiredPackageName) {
    failures.push(`candidate package name is ${candidate.name}, expected ${requiredPackageName}`);
  }
  if (countCommands(candidate) !== requiredCommandCount) {
    failures.push(
      `candidate has ${countCommands(candidate)} commands, expected ${requiredCommandCount}`
    );
  }
  if (countSettings(candidate) !== requiredSettingCount) {
    failures.push(
      `candidate has ${countSettings(candidate)} settings, expected ${requiredSettingCount}`
    );
  }
  if (fs.existsSync(path.join(candidateDirectory, ".installignore"))) {
    failures.push("candidate still has .installignore");
  }

  if (failures.length === 0) {
    console.log("Cutover manifest preflight passed.");
    return 0;
  }

  console.error("Cutover manifest preflight failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  return 1;
}

process.exitCode = validateCutover();
