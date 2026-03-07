#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-queue");

let hasFailure = false;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
const queuePath = path.join(tmpRoot, "queue.json");
const ledgerPath = path.join(tmpRoot, "mode-diff-ledger.jsonl");
const dbDir = path.join(tmpRoot, "scan-db");
const perfA = path.join(tmpRoot, "a-perf.json");
const econA = path.join(tmpRoot, "a-econ.json");
const perfB = path.join(tmpRoot, "b-perf.json");
const econB = path.join(tmpRoot, "b-econ.json");

writeJson(perfA, makeReport({ title: "批量样本A", author: "作者甲", tags: ["玄幻"], pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
writeJson(econA, makeReport({ title: "批量样本A", author: "作者甲", tags: ["玄幻"], pipelineMode: "economy", batchIds: ["B01", "B02", "B03"], totalBatches: 4, rating: 5, eventCount: 1, relationCount: 0 }));
writeJson(perfB, makeReport({ title: "批量样本B", author: "作者乙", tags: ["都市"], pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
writeJson(econB, makeReport({ title: "批量样本B", author: "作者乙", tags: ["都市"], pipelineMode: "economy", batchIds: ["B01", "B02"], totalBatches: 4, rating: 4, eventCount: 1, relationCount: 0 }));

writeJson(queuePath, {
  ledger: ledgerPath,
  db: dbDir,
  jobs: [
    { name: "样本A", perf: perfA, econ: econA, out_dir: path.join(tmpRoot, "out", "a"), title: "批量样本A 模式对比" },
    { name: "样本B", perf: perfB, econ: econB, out_dir: path.join(tmpRoot, "out", "b"), title: "批量样本B 模式对比" },
  ],
});

const summaryOut = path.join(tmpRoot, "queue-summary.json");
const result = runNode("packages/saoshu-harem-review/scripts/mode_diff_queue_run.mjs", ["--queue", queuePath, "--out", summaryOut]);
if (result.status === 0) ok("mode_diff_queue_run batch run");
else fail(`mode_diff_queue_run batch run failed\nSTDERR:\n${result.stderr}`);

const summary = JSON.parse(fs.readFileSync(summaryOut, "utf8"));
if (summary.success === 2 && summary.failed === 0 && summary.sync?.status === "success") ok("mode_diff_queue_run records success summary and sync step");
else fail(`mode_diff_queue_run should report two successes and sync success: ${JSON.stringify(summary)}`);

const ledgerLines = fs.readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
if (ledgerLines.length === 2) ok("mode_diff_queue_run appends both jobs into ledger");
else fail(`mode_diff_queue_run should append two ledger entries: ${ledgerLines.length}`);

const mdPath = summaryOut.replace(/\.json$/i, ".md");
const htmlPath = summaryOut.replace(/\.json$/i, ".html");
if (fs.existsSync(mdPath) && fs.existsSync(htmlPath)) ok("mode_diff_queue_run writes markdown/html overview pages");
else fail("mode_diff_queue_run should write markdown/html overview pages");

if (fs.existsSync(path.join(tmpRoot, "mode-diff-summary", "mode-diff-ledger-summary.json")) && fs.existsSync(path.join(dbDir, "compare", "compare.json")) && fs.existsSync(path.join(dbDir, "trends", "trends.json")) && fs.existsSync(path.join(dbDir, "dashboard.html"))) ok("mode_diff_queue_run refreshes summary and db artifacts once batch finishes");
else fail("mode_diff_queue_run should refresh summary/db artifacts");

if (!hasFailure) console.log("Mode diff queue check passed.");
else process.exitCode = 1;