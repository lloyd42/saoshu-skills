#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-chapter-full-fallback");

let hasFailure = false;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function runNode(scriptPath, args = [], options = {}) {
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
  try {
    const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], {
      cwd: options.cwd || repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(options.env || {}) },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || error),
    };
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeFixture(dir) {
  ensureCleanDir(dir);
  const manifestPath = path.join(dir, "manifest.json");
  const novelPath = path.join(dir, "novel.txt");
  const paragraph = "男主与众女主在宗门中推进主线，气氛稳定，没有明确章节标题，但每段都是独立场景，需要按分段继续全文扫描。";
  const novelContent = Array.from({ length: 120 }, (_, index) => `${paragraph}${index + 1}\n\n`).join("");
  writeUtf8File(novelPath, novelContent);
  const manifest = {
    input_txt: "./novel.txt",
    output_dir: "./workspace/chapter-full-fallback",
    title: "无章节正文-章节级全文",
    author: "公开夹具",
    tags: "测试/无章节",
    target_defense: "布甲",
    batch_size: 10,
    overlap: 0,
    enrich_mode: "fallback",
    enricher_cmd: "",
    coverage_mode: "chapter-full",
    chapter_detect_mode: "auto",
    wiki_dict: "",
    report_default_view: "newbie",
    report_pdf: false,
    report_relation_graph: false,
    db_mode: "local",
    db_path: "./workspace/chapter-full-fallback/scan-db",
    db_ingest_cmd: "",
  };
  writeUtf8Json(manifestPath, manifest, { newline: true });
  return { manifestPath, outputDir: path.join(dir, "workspace", "chapter-full-fallback") };
}

const fixture = writeFixture(tmpRoot);
ok("prepared chapter-full fallback fixture");

const pipeline = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
if (pipeline.status === 0) ok("chapter-full fallback pipeline run");
else fail(`chapter-full fallback pipeline failed\nSTDOUT:\n${pipeline.stdout}\nSTDERR:\n${pipeline.stderr}`);

const reportJson = path.join(fixture.outputDir, "merged-report.json");
const statePath = path.join(fixture.outputDir, "pipeline-state.json");
const batchPath = path.join(fixture.outputDir, "batches-all", "B01.json");
const reviewIndex = path.join(fixture.outputDir, "review-pack", "README-review-index.md");
const dbRuns = path.join(fixture.outputDir, "scan-db", "runs.jsonl");
const assistDir = path.join(fixture.outputDir, "chapter-detect-assist");

for (const item of [reportJson, statePath, batchPath, reviewIndex, dbRuns]) {
  if (fs.existsSync(item)) ok(`${path.basename(item)} exists`);
  else fail(`missing output: ${item}`);
}
if (fs.existsSync(path.join(assistDir, "chapter-detect-request.md"))) ok("chapter assist pack is still generated for later human repair");
else fail("chapter assist pack should still be generated during segment fallback");

const report = readJson(reportJson);
const state = readJson(statePath);
const batch = readJson(batchPath);
const dbRun = readJsonl(dbRuns).slice(-1)[0] || {};

  if (report.scan?.sampling?.coverage_mode === "chapter-full") ok("report keeps chapter-full coverage mode");
  else fail(`report should keep chapter-full coverage mode: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (String(report.novel?.tags || "").includes("[CHAPTER-FULL]")) ok("report tags use chapter-full coverage-first marker");
  else fail(`report tags should use chapter-full coverage-first marker: ${JSON.stringify(report.novel || {})}`);
  if (report.scan?.sampling?.coverage_unit === "segment") ok("report marks segment coverage unit after chapter fallback");
  else fail(`report should mark segment coverage unit: ${JSON.stringify(report.scan?.sampling || {})}`);
if (report.scan?.sampling?.chapter_detect_used_mode === "segment-fallback") ok("report marks segment-fallback detect path");
else fail(`report should mark segment-fallback detect path: ${JSON.stringify(report.scan?.sampling || {})}`);
if (Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("执行说明：章节识别失败后，当前已退化为分段级全文扫描"))) ok("report basis lines explain chapter-full segment fallback");
else fail("report basis lines should explain chapter-full segment fallback");

if (state.coverage_mode === "chapter-full") ok("state keeps chapter-full coverage mode");
else fail(`state should keep chapter-full coverage mode: ${JSON.stringify(state)}`);
if (state.coverage_unit === "segment") ok("state records segment coverage unit");
else fail(`state should record segment coverage unit: ${JSON.stringify(state)}`);
if (state.chapter_detect_used_mode === "segment-fallback") ok("state records segment-fallback detect path");
else fail(`state should record segment-fallback detect path: ${JSON.stringify(state)}`);

if (/^分段\d+-\d+$/.test(String(batch.range || ""))) ok("batch range switches to segment wording");
else fail(`batch range should use segment wording: ${JSON.stringify(batch)}`);
if (batch.metadata?.chapter_detect?.used_mode === "segment-fallback" && batch.metadata?.chapter_detect?.unit_type === "segment") ok("batch metadata keeps segment fallback diagnostics");
else fail(`batch metadata should keep segment fallback diagnostics: ${JSON.stringify(batch.metadata?.chapter_detect || {})}`);

if (dbRun.coverage_mode === "chapter-full" && dbRun.coverage_unit === "segment" && dbRun.chapter_detect_used_mode === "segment-fallback") ok("db run keeps chapter-full segment fallback contract");
else fail(`db run should keep chapter-full segment fallback contract: ${JSON.stringify(dbRun)}`);

const dbOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", path.join(fixture.outputDir, "scan-db"), "--metric", "overview", "--format", "text"]);
if (dbOverview.status === 0) ok("chapter-full fallback db overview query");
else fail(`db overview failed\nSTDERR:\n${dbOverview.stderr}`);
if (dbOverview.stdout.includes("Top coverage units: segment(1)") && dbOverview.stdout.includes("Top chapter detect modes: segment-fallback(1)")) ok("db overview surfaces segment fallback summary");
else fail(`db overview should surface segment fallback summary\nSTDOUT:\n${dbOverview.stdout}`);

if (!hasFailure) console.log("Chapter-full fallback check passed.");
else process.exitCode = 1;
