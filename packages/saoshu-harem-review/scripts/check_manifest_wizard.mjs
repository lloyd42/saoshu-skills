#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-manifest-wizard");

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function runWizard(args) {
  const scriptPath = path.join(repoRoot, "packages", "saoshu-harem-review", "scripts", "manifest_wizard.mjs");
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ? String(error.stdout) : "",
      stderr: error.stderr ? String(error.stderr) : String(error.message || error),
    };
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

ensureCleanDir(tmpRoot);

const inputTxt = path.join(tmpRoot, "novel.txt");
const outputManifest = path.join(tmpRoot, "manifest.json");
fs.writeFileSync(inputTxt, "第一章 开局\n测试文本\n", "utf8");

const success = runWizard([
  "--output", outputManifest,
  "--preset", "newbie",
  "--non-interactive",
  "--input-txt", inputTxt,
  "--output-dir", "./workspace/wizard-case",
  "--title", "向导夹具",
  "--author", "公开夹具",
]);

if (success.status === 0) ok("manifest wizard non-interactive run");
else fail(`manifest wizard non-interactive run failed\nSTDERR:\n${success.stderr}`);

if (fs.existsSync(outputManifest)) ok("manifest wizard writes manifest file");
else fail("manifest wizard should write manifest file");

const manifest = readJson(outputManifest);
if (manifest.pipeline_mode === "economy" && manifest.sample_mode === "dynamic" && manifest.sample_level === "auto") ok("newbie preset keeps economy dynamic auto defaults");
else fail("newbie preset should keep economy dynamic auto defaults");

if (manifest.report_relation_graph_output === "./workspace/wizard-case/relation-graph.html") ok("wizard derives relation graph output from output_dir");
else fail("wizard should derive relation graph output from output_dir");

const missingInput = runWizard([
  "--output", path.join(tmpRoot, "missing-input.json"),
  "--preset", "newbie",
  "--non-interactive",
  "--input-txt", path.join(tmpRoot, "missing.txt"),
  "--output-dir", "./workspace/missing-input",
  "--title", "坏夹具",
]);

if (missingInput.status !== 0 && missingInput.stderr.includes("input_txt not found")) ok("wizard rejects missing input file in non-interactive mode");
else fail("wizard should reject missing input file in non-interactive mode");

const externalDb = runWizard([
  "--output", path.join(tmpRoot, "external-db.json"),
  "--preset", "newbie",
  "--non-interactive",
  "--input-txt", inputTxt,
  "--output-dir", "./workspace/external-db",
  "--title", "坏夹具",
]);

if (externalDb.status === 0) ok("wizard non-interactive leaves default local db mode valid");
else fail("wizard default local db mode should stay valid");

if (!hasFailure) {
  console.log("Manifest wizard check passed.");
} else {
  process.exitCode = 1;
}
