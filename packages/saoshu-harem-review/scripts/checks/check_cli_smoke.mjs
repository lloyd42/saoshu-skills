#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const scriptsToCheck = [
  "packages/saoshu-harem-review/scripts/saoshu_cli.mjs",
  "packages/saoshu-harem-review/scripts/run_pipeline.mjs",
  "packages/saoshu-harem-review/scripts/manifest_wizard.mjs",
  "packages/saoshu-harem-review/scripts/relation_graph.mjs",
  "packages/saoshu-harem-review/scripts/scan_txt_batches.mjs",
  "packages/saoshu-term-wiki/scripts/query_term_wiki.mjs",
  "packages/saoshu-scan-db/scripts/db_query.mjs",
];

const requiredFixtures = [
  "examples/minimal/README.md",
  "examples/minimal/novel.txt",
  "examples/minimal/manifest.json",
];

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

for (const relativePath of requiredFixtures) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (fs.existsSync(absolutePath)) {
    ok(`found ${relativePath}`);
  } else {
    fail(`missing ${relativePath}`);
  }
}

for (const scriptPath of scriptsToCheck) {
  const absoluteScriptPath = path.join(repoRoot, scriptPath);
  const text = fs.readFileSync(absoluteScriptPath, "utf8");
  const hasHelpFlag = text.includes('"--help"') || text.includes("'--help'");
  const hasShortHelpFlag = text.includes('"-h"') || text.includes("'-h'");
  const hasUsageContract = text.includes("Usage:") || text.includes("showHelp(") || text.includes("showCliHelp(") || text.includes("usage(");

  if (!hasHelpFlag || !hasShortHelpFlag) {
    fail(`missing help flags in ${scriptPath}`);
    continue;
  }
  if (!hasUsageContract) {
    fail(`missing usage/help output in ${scriptPath}`);
    continue;
  }
  ok(`help contract ${scriptPath}`);
}

try {
  const cliHelp = execFileSync(process.execPath, [path.join(repoRoot, "packages/saoshu-harem-review/scripts/saoshu_cli.mjs"), "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (cliHelp.includes("Usage:") && cliHelp.includes("saoshu_cli.mjs scan")) ok("runtime help saoshu_cli.mjs");
  else fail("runtime help output unexpected in packages/saoshu-harem-review/scripts/saoshu_cli.mjs");
} catch (err) {
  fail(`runtime help failed for packages/saoshu-harem-review/scripts/saoshu_cli.mjs: ${err.stderr || err.message}`);
}

if (!hasFailure) {
  console.log("CLI help contract check passed.");
} else {
  process.exitCode = 1;
}
