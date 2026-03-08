#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-ledger");

let hasFailure = false;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function writeJson(filePath, payload) {
  writeUtf8Json(filePath, payload, { newline: true });
}

function runNode(scriptPath, args = []) {
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
  try {
    const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: typeof error.status === "number" ? error.status : 1, stdout: String(error.stdout || ""), stderr: String(error.stderr || error.message || error) };
  }
}

function makeReport({ title, author, tags, verdict = "待补证", rating = 6, batchIds = [], totalBatches = batchIds.length, pipelineMode = "performance", eventCount = 2, relationCount = 1 }) {
  return {
    novel: { title, author },
    overall: { verdict, rating },
    scan: {
      batch_count: batchIds.length,
      batch_ids: batchIds,
      sampling: {
        pipeline_mode: pipelineMode,
        sample_mode: pipelineMode === "economy" ? "dynamic" : "fixed",
        sample_strategy: pipelineMode === "economy" ? "risk-aware" : "uniform",
        sample_level: "auto",
        sample_level_effective: pipelineMode === "economy" ? "medium" : "high",
        sample_level_recommended: pipelineMode === "economy" ? "medium" : "high",
        total_batches: totalBatches,
        selected_batches: batchIds.length,
        coverage_ratio: totalBatches ? batchIds.length / totalBatches : 0,
      },
    },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: [],
    events: {
      items: Array.from({ length: eventCount }, (_, index) => ({ rule_candidate: `事件${index + 1}`, event_id: `E${index + 1}`, chapter_range: `第${index + 1}章` })),
    },
    follow_up_questions: ["Q1"],
    metadata_summary: {
      tags,
      relationships: Array.from({ length: relationCount }, (_, index) => ({ from: `甲${index + 1}`, to: `乙${index + 1}`, type: "关系" })),
    },
  };
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const ledgerPath = path.join(tmpRoot, "mode-diff-ledger.jsonl");

const cases = [
  { title: "玄幻样本", author: "作者甲", tags: ["玄幻", "多女主"] },
  { title: "都市样本", author: "作者乙", tags: ["都市", "感情线"] },
  { title: "校园样本", author: "作者甲", tags: ["校园", "日常"] },
];

for (const item of cases) {
  const workDir = path.join(tmpRoot, item.title);
  const perfPath = path.join(workDir, "perf.json");
  const econPath = path.join(workDir, "econ.json");
  const outDir = path.join(workDir, "out");

  writeJson(perfPath, makeReport({ title: item.title, author: item.author, tags: item.tags, pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
  writeJson(econPath, makeReport({ title: item.title, author: item.author, tags: item.tags, pipelineMode: "economy", batchIds: ["B01", "B02", "B03"], totalBatches: 4, rating: 5, eventCount: 1, relationCount: 0 }));

  const result = runNode("packages/saoshu-harem-review/scripts/compare_reports.mjs", ["--perf", perfPath, "--econ", econPath, "--out-dir", outDir, "--title", `${item.title} 模式对比`, "--ledger", ledgerPath]);
  if (result.status === 0) ok(`compare_reports ledger run for ${item.title}`);
  else fail(`compare_reports ledger run failed for ${item.title}\nSTDERR:\n${result.stderr}`);
}

if (fs.existsSync(ledgerPath)) ok("mode-diff ledger file created");
else fail("compare_reports should create ledger file");

const lines = fs.readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
if (lines.length === 3) ok("compare_reports appends one ledger entry per work");
else fail(`expected 3 ledger entries, got ${lines.length}`);

const summaryOutDir = path.join(tmpRoot, "summary");
const summaryResult = runNode("packages/saoshu-harem-review/scripts/mode_diff_ledger.mjs", ["--ledger", ledgerPath, "--output-dir", summaryOutDir, "--title", "跨书 mode-diff 台账汇总"]);
if (summaryResult.status === 0) ok("mode_diff_ledger summary run");
else fail(`mode_diff_ledger summary run failed\nSTDERR:\n${summaryResult.stderr}`);

const summaryPath = path.join(summaryOutDir, "mode-diff-ledger-summary.json");
if (fs.existsSync(summaryPath)) ok("mode_diff_ledger writes summary json");
else fail("mode_diff_ledger should write summary json");

const summaryPayload = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const summary = summaryPayload.summary || {};
if (summary.recommendation?.action === "evaluate_middle_mode" && summary.diversity?.cross_genre_gray_signal === true) ok("mode_diff_ledger detects repeated gray cross-genre signal");
else fail(`mode_diff_ledger should recommend evaluating middle mode: ${JSON.stringify(summary.recommendation)} / diversity=${JSON.stringify(summary.diversity)}`);

if (summary.gain_window_counts?.gray === 3 && summary.total_entries === 3) ok("mode_diff_ledger aggregates gray counts across works");
else fail(`mode_diff_ledger should aggregate three gray works: ${JSON.stringify(summary)}`);

if (fs.existsSync(path.join(summaryOutDir, "mode-diff-ledger-summary.md")) && fs.existsSync(path.join(summaryOutDir, "mode-diff-ledger-summary.html"))) ok("mode_diff_ledger writes markdown and html outputs");
else fail("mode_diff_ledger should write markdown/html outputs");

const summaryMarkdown = fs.readFileSync(path.join(summaryOutDir, "mode-diff-ledger-summary.md"), "utf8");
if (summaryMarkdown.includes("平均快速摸底覆盖率") && summaryMarkdown.includes("快速摸底少看到 1 条关系边")) ok("mode_diff_ledger markdown uses coverage-first framing");
else fail("mode_diff_ledger markdown should use coverage-first framing");

if (!hasFailure) console.log("Mode diff ledger check passed.");
else process.exitCode = 1;
