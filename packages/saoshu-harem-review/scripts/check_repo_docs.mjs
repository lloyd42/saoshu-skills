#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const requiredFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "package.json",
  ".github/workflows/ci.yml",
];

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (fs.existsSync(absolutePath)) {
    ok(`found ${relativePath}`);
  } else {
    fail(`missing ${relativePath}`);
  }
}

if (!hasFailure) {
  console.log("Repository docs check passed.");
} else {
  process.exitCode = 1;
}
