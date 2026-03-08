#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packagesRoot = path.join(repoRoot, "packages");
const scanRoots = fs.readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesRoot, entry.name, "scripts"))
  .filter((dir) => fs.existsSync(dir));
const allowedFiles = new Set([
  "packages/saoshu-harem-review/scripts/lib/text_output.mjs",
]);
const patterns = [
  { label: "writeFileSync", regex: /\b(?:fs\.)?writeFileSync\s*\(/g },
  { label: "appendFileSync", regex: /\b(?:fs\.)?appendFileSync\s*\(/g },
  { label: "fs.promises.writeFile", regex: /\bfs\.promises\.writeFile\s*\(/g },
  { label: "fs.promises.appendFile", regex: /\bfs\.promises\.appendFile\s*\(/g },
];
let hasFailure = false;
let checkedFiles = 0;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".tmp" || entry.name === "node_modules") continue;
      walk(fullPath, output);
    } else if (entry.name.endsWith(".mjs")) {
      output.push(fullPath);
    }
  }
  return output;
}

for (const root of scanRoots) {
  for (const filePath of walk(root)) {
    const relativePath = path.relative(repoRoot, filePath).replaceAll("\\", "/");
    checkedFiles += 1;
    if (allowedFiles.has(relativePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const pattern of patterns) {
      const match = pattern.regex.exec(text);
      pattern.regex.lastIndex = 0;
      if (match) {
        const before = text.slice(0, match.index);
        const line = before.split(/\r?\n/u).length;
        fail(`${relativePath}:${line} should use shared text_output helper instead of raw ${pattern.label}`);
      }
    }
  }
}

if (!hasFailure) {
  ok(`checked ${checkedFiles} script files for helper-only raw text writes`);
  console.log("Text output usage check passed.");
} else {
  process.exitCode = 1;
}