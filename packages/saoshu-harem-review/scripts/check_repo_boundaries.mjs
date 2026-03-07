#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const allowedRoots = [
  path.join(repoRoot, "packages"),
  path.join(repoRoot, "docs"),
  path.join(repoRoot, ".github"),
];

const forbiddenSnippets = [
  "D:/codex/asset",
  "D:/codex/test",
  "D:/codex/tmp",
  "D:\\codex\\asset",
  "D:\\codex\\test",
  "D:\\codex\\tmp",
];
const forbiddenPatterns = [
  { label: "windows user-profile absolute path", regex: /(?:^|[\s"'`=(])(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'`]+[\\/][^\r\n"'`]+)/m },
  { label: "unix home absolute path", regex: /(?:^|[\s"'`=(])(?:\/(?:Users|home)\/[^\s"'`]+\/[^\r\n"'`]+)/m },
  { label: "temporary absolute path", regex: /(?:^|[\s"'`=(])(?:[A-Za-z]:[\\/](?:temp|tmp)[\\/][^\r\n"'`]+|\/(?:tmp|var\/tmp|private\/tmp)\/[^\r\n"'`]+)/m },
];

let hasFailure = false;

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      walk(fullPath, output);
    } else {
      output.push(fullPath);
    }
  }
  return output;
}

const files = walk(repoRoot).filter((filePath) => {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.endsWith("/check_repo_boundaries.mjs")) return false;
  return [".mjs", ".json", ".yaml", ".yml", ".md"].some((ext) => normalized.endsWith(ext));
});

for (const filePath of files) {
  const normalized = filePath.replaceAll("\\", "/");
  const text = fs.readFileSync(filePath, "utf8");
  for (const snippet of forbiddenSnippets) {
    if (text.includes(snippet)) {
      fail(`external dev path found in ${normalized}: ${snippet}`);
    }
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.regex.test(text)) {
      fail(`absolute local path pattern found in ${normalized}: ${pattern.label}`);
    }
  }
}

for (const root of allowedRoots) {
  if (fs.existsSync(root)) {
    ok(`checked ${path.relative(repoRoot, root)}`);
  }
}

if (!hasFailure) {
  console.log("Repository boundary check passed.");
} else {
  process.exitCode = 1;
}
