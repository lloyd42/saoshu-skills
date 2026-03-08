import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const exts = new Set([".md", ".json", ".mjs", ".yml", ".yaml", ".txt"]);
const skipDirs = new Set([".git", "node_modules", ".tmp"]);
const skipFragments = ["/examples/minimal/workspace/"];
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
      if (skipDirs.has(entry.name)) continue;
      walk(fullPath, output);
    } else {
      output.push(fullPath);
    }
  }
  return output;
}

function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

const files = walk(repoRoot).filter((filePath) => {
  const normalized = filePath.replaceAll("\\", "/");
  if (skipFragments.some((fragment) => normalized.includes(fragment))) return false;
  return exts.has(path.extname(filePath).toLowerCase());
});

for (const filePath of files) {
  const normalized = path.relative(repoRoot, filePath).replaceAll("\\", "/");
  const buf = fs.readFileSync(filePath);
  const text = buf.toString("utf8");
  if (hasUtf8Bom(buf)) fail(`UTF-8 BOM found in ${normalized}; repository baseline is UTF-8 without BOM + LF`);
  if (buf.includes(0x00)) fail(`NUL byte found in ${normalized}`);
  if (text.includes(String.fromCharCode(0xfffd))) fail(`replacement character found in ${normalized}`);
}

if (!hasFailure) {
  ok(`checked ${files.length} text files against UTF-8 without BOM baseline`);
  console.log("Repository encoding check passed.");
} else {
  process.exitCode = 1;
}
