#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-workflow");

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
const perfPath = path.join(tmpRoot, "perf.json");
const econPath = path.join(tmpRoot, "econ.json");
const compareOutDir = path.join(tmpRoot, "mode-diff", "sample-a");
const ledgerPath = path.join(tmpRoot, "mode-diff-ledger.jsonl");
const summaryDir = path.join(tmpRoot, "mode-diff-summary");
const dbDir = path.join(tmpRoot, "scan-db");

writeJson(perfPath, makeReport({ title: "真实样本A", author: "作者甲", tags: ["玄幻", "后宫"], pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
writeJson(econPath, makeReport({ title: "真实样本A", author: "作者甲", tags: ["玄幻", "后宫"], pipelineMode: "economy", batchIds: ["B01", "B02", "B03"], totalBatches: 4, rating: 5, eventCount: 1, relationCount: 0 }));

const record = runNode("packages/saoshu-harem-review/scripts/mode_diff_workflow.mjs", ["--perf", perfPath, "--econ", econPath, "--out-dir", compareOutDir, "--ledger", ledgerPath, "--summary-dir", summaryDir, "--db", dbDir, "--title", "真实样本A 模式对比"]);
if (record.status === 0) ok("mode_diff_workflow record run");
else fail(`mode_diff_workflow record run failed\nSTDERR:\n${record.stderr}`);

if (fs.existsSync(path.join(compareOutDir, "mode-diff.json")) && fs.existsSync(path.join(summaryDir, "mode-diff-ledger-summary.json"))) ok("mode_diff_workflow writes compare and summary outputs");
else fail("mode_diff_workflow should write compare and summary outputs");

if (fs.existsSync(path.join(dbDir, "mode_diff_entries.jsonl")) && fs.existsSync(path.join(dbDir, "compare", "compare.json")) && fs.existsSync(path.join(dbDir, "trends", "trends.json")) && fs.existsSync(path.join(dbDir, "dashboard.html"))) ok("mode_diff_workflow refreshes db compare/trends/dashboard outputs");
else fail("mode_diff_workflow should refresh db artifacts");

const sync = runNode("packages/saoshu-harem-review/scripts/mode_diff_workflow.mjs", ["--ledger", ledgerPath, "--summary-dir", summaryDir, "--db", dbDir]);
if (sync.status === 0) ok("mode_diff_workflow sync run");
else fail(`mode_diff_workflow sync run failed\nSTDERR:\n${sync.stderr}`);

const summaryPayload = JSON.parse(fs.readFileSync(path.join(summaryDir, "mode-diff-ledger-summary.json"), "utf8"));
if (summaryPayload.summary?.total_entries === 1) ok("mode_diff_workflow keeps ledger summary in sync");
else fail(`mode_diff_workflow should keep summary in sync: ${JSON.stringify(summaryPayload.summary)}`);

if (!hasFailure) console.log("Mode diff workflow check passed.");
else process.exitCode = 1;