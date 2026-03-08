#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dev", "sync_installed_skills.mjs");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "saoshu-installed-skills-"));
const destRoot = path.join(tempRoot, "skills");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function compareFiles(relativePath, skillName) {
  const repoFile = path.join(repoRoot, "packages", skillName, relativePath);
  const installedFile = path.join(destRoot, skillName, relativePath);
  assert(fs.existsSync(installedFile), `missing synced file: ${path.join(skillName, relativePath)}`);
  assert(readUtf8(installedFile) === readUtf8(repoFile), `content mismatch: ${path.join(skillName, relativePath)}`);
  console.log(`OK: synced ${path.join(skillName, relativePath)}`);
}

try {
  execFileSync(process.execPath, [
    scriptPath,
    "--dest-root", destRoot,
    "--skills", "saoshu-harem-review,saoshu-scan-db,saoshu-orchestrator",
    "--validate"
  ], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  compareFiles("SKILL.md", "saoshu-orchestrator");
  compareFiles(path.join("agents", "openai.yaml"), "saoshu-orchestrator");
  compareFiles("README.md", "saoshu-scan-db");
  compareFiles("SKILL.md", "saoshu-scan-db");
  compareFiles(path.join("references", "product-manual.md"), "saoshu-harem-review");
  compareFiles(path.join("references", "architecture", "overview.md"), "saoshu-harem-review");
  console.log("Installed skill sync check passed.");
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
