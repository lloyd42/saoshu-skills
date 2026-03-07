#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePipelineManifest } from "./lib/pipeline_manifest.mjs";

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

const sampledResolved = resolvePipelineManifest(outputManifest, {
  input_txt: inputTxt,
  output_dir: "./workspace/coverage-sampled",
  title: "兼容口径-抽样",
  coverage_mode: "sampled",
  coverage_template: "opening-100",
  serial_status: "ongoing",
});
if (sampledResolved.coverageMode === "sampled" && sampledResolved.coverageTemplate === "opening-100" && sampledResolved.serialStatus === "ongoing" && sampledResolved.pipelineMode === "economy" && sampledResolved.sampleMode === "dynamic" && sampledResolved.sampleLevel === "auto") ok("coverage_mode=sampled with coverage_template maps to economy defaults");
else fail("coverage_mode=sampled with coverage_template should map to economy + dynamic + auto");

const chapterFullResolved = resolvePipelineManifest(outputManifest, {
  input_txt: inputTxt,
  output_dir: "./workspace/coverage-chapter-full",
  title: "兼容口径-章节级",
  coverage_mode: "chapter-full",
});
if (chapterFullResolved.coverageMode === "chapter-full" && chapterFullResolved.pipelineMode === "performance") ok("coverage_mode=chapter-full maps to performance baseline");
else fail("coverage_mode=chapter-full should map to performance baseline");

try {
  resolvePipelineManifest(outputManifest, {
    input_txt: inputTxt,
    output_dir: "./workspace/coverage-conflict",
    title: "兼容口径-冲突",
    coverage_mode: "sampled",
    pipeline_mode: "performance",
  });
  fail("conflicting coverage_mode and pipeline_mode should be rejected");
} catch (error) {
  if (String(error.message || error).includes("coverage_mode 与 pipeline_mode 冲突")) ok("conflicting coverage_mode and pipeline_mode is rejected");
  else fail(`unexpected conflict error: ${error.message || error}`);
}

try {
  resolvePipelineManifest(outputManifest, {
    input_txt: inputTxt,
    output_dir: "./workspace/template-conflict",
    title: "模板冲突",
    pipeline_mode: "performance",
    coverage_template: "head-tail",
  });
  fail("coverage_template on performance baseline should be rejected");
} catch (error) {
  if (String(error.message || error).includes("coverage_template 与当前覆盖层冲突")) ok("coverage_template is rejected outside sampled/economy path");
  else fail(`unexpected template conflict error: ${error.message || error}`);
}

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
