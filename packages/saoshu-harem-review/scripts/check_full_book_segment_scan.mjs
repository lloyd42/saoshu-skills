#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-full-book-segment-scan");

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
  const chapters = Array.from({ length: 18 }, (_, index) => {
    const chapterNo = index + 1;
    return `第${chapterNo}章 章节${chapterNo}\n男主与多位女主在不同场景推进关系线，第${chapterNo}章包含明确章节标题，但 full-book 仍应按整书连续分段全文扫描。\n\n补充说明${chapterNo}：这里继续提供足够正文，保证会被切成多个分段。`;
  });
  fs.writeFileSync(novelPath, chapters.join("\n\n"), "utf8");
  const manifest = {
    input_txt: "./novel.txt",
    output_dir: "./workspace/full-book-segment",
    title: "有章节正文-整书最终确认",
    author: "公开夹具",
    tags: "测试/整书确认",
    target_defense: "布甲",
    batch_size: 10,
    overlap: 0,
    enrich_mode: "fallback",
    enricher_cmd: "",
    coverage_mode: "full-book",
    chapter_detect_mode: "auto",
    wiki_dict: "",
    report_default_view: "newbie",
    report_pdf: false,
    report_relation_graph: false,
    db_mode: "local",
    db_path: "./workspace/full-book-segment/scan-db",
    db_ingest_cmd: "",
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifestPath, outputDir: path.join(dir, "workspace", "full-book-segment") };
}

const fixture = writeFixture(tmpRoot);
ok("prepared full-book segment fixture");

const pipeline = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
if (pipeline.status === 0) ok("full-book pipeline run");
else fail(`full-book pipeline failed\nSTDOUT:\n${pipeline.stdout}\nSTDERR:\n${pipeline.stderr}`);

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
if (!fs.existsSync(path.join(assistDir, "chapter-detect-request.md"))) ok("full-book direct segment scan does not require chapter assist pack");
else fail("full-book direct segment scan should not emit chapter assist pack by default");

const report = readJson(reportJson);
const state = readJson(statePath);
const batch = readJson(batchPath);
const dbRun = readJsonl(dbRuns).slice(-1)[0] || {};

  if (report.scan?.sampling?.coverage_mode === "full-book") ok("report keeps full-book coverage mode");
  else fail(`report should keep full-book coverage mode: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (String(report.novel?.tags || "").includes("[FULL-BOOK]")) ok("report tags use full-book coverage-first marker");
  else fail(`report tags should use full-book coverage-first marker: ${JSON.stringify(report.novel || {})}`);
  if (report.scan?.sampling?.coverage_unit === "segment") ok("report marks full-book segment coverage unit");
  else fail(`report should mark full-book segment coverage unit: ${JSON.stringify(report.scan?.sampling || {})}`);
if (report.scan?.sampling?.chapter_detect_used_mode === "segment-full-book") ok("report marks full-book segment detect path");
else fail(`report should mark full-book segment detect path: ${JSON.stringify(report.scan?.sampling || {})}`);
if (Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("执行说明：当前按整书连续分段做全文扫描，不依赖章节识别"))) ok("report basis lines explain full-book direct segment scan");
else fail("report basis lines should explain full-book direct segment scan");

if (state.coverage_mode === "full-book") ok("state keeps full-book coverage mode");
else fail(`state should keep full-book coverage mode: ${JSON.stringify(state)}`);
if (state.coverage_unit === "segment") ok("state records full-book segment coverage unit");
else fail(`state should record full-book segment coverage unit: ${JSON.stringify(state)}`);
if (state.chapter_detect_used_mode === "segment-full-book") ok("state records full-book segment detect path");
else fail(`state should record full-book segment detect path: ${JSON.stringify(state)}`);

if (/^分段\d+-\d+$/.test(String(batch.range || ""))) ok("batch range switches to segment wording");
else fail(`batch range should use segment wording: ${JSON.stringify(batch)}`);
if (batch.metadata?.chapter_detect?.used_mode === "segment-full-book" && batch.metadata?.chapter_detect?.unit_type === "segment") ok("batch metadata keeps full-book segment diagnostics");
else fail(`batch metadata should keep full-book segment diagnostics: ${JSON.stringify(batch.metadata?.chapter_detect || {})}`);

if (dbRun.coverage_mode === "full-book" && dbRun.coverage_unit === "segment" && dbRun.chapter_detect_used_mode === "segment-full-book") ok("db run keeps full-book segment contract");
else fail(`db run should keep full-book segment contract: ${JSON.stringify(dbRun)}`);

const dbOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", path.join(fixture.outputDir, "scan-db"), "--metric", "overview", "--format", "text"]);
if (dbOverview.status === 0) ok("full-book db overview query");
else fail(`db overview failed\nSTDERR:\n${dbOverview.stderr}`);
if (dbOverview.stdout.includes("Top coverage units: segment(1)") && dbOverview.stdout.includes("Top chapter detect modes: segment-full-book(1)")) ok("db overview surfaces full-book segment summary");
else fail(`db overview should surface full-book segment summary\nSTDOUT:\n${dbOverview.stdout}`);

if (!hasFailure) console.log("Full-book segment scan check passed.");
else process.exitCode = 1;
