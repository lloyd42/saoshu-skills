#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json, writeUtf8Jsonl } from "./lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-db-mode-diff-integration");

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
const dbDir = path.join(tmpRoot, "scan-db");
writeUtf8Jsonl(path.join(dbDir, "runs.jsonl"), [{ ingested_at: "2026-03-08T09:00:00Z", title: "仪表盘夹具", verdict: "慎入", rating: 5, coverage_mode: "sampled", coverage_template: "opening-latest", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", pipeline_mode: "economy", coverage_unit: "chapter", chapter_detect_used_mode: "script", serial_status: "ongoing", coverage_ratio: 0.5, coverage_gap_summary: "中后段仍未完整覆盖" }]);

const cases = [
  { title: "玄幻样本", author: "作者甲", tags: ["玄幻", "多女主"] },
  { title: "都市样本", author: "作者乙", tags: ["都市", "感情线"] },
  { title: "校园样本", author: "作者丙", tags: ["校园", "日常"] },
];

for (const item of cases) {
  const workDir = path.join(tmpRoot, item.title);
  const perfPath = path.join(workDir, "perf.json");
  const econPath = path.join(workDir, "econ.json");
  const outDir = path.join(workDir, "out");

  writeJson(perfPath, makeReport({ title: item.title, author: item.author, tags: item.tags, pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
  writeJson(econPath, makeReport({ title: item.title, author: item.author, tags: item.tags, pipelineMode: "economy", batchIds: ["B01", "B02", "B03"], totalBatches: 4, rating: 5, eventCount: 1, relationCount: 0 }));

  const result = runNode("packages/saoshu-harem-review/scripts/compare_reports.mjs", ["--perf", perfPath, "--econ", econPath, "--out-dir", outDir, "--title", `${item.title} 模式对比`, "--ledger", ledgerPath]);
  if (result.status === 0) ok(`mode-diff ledger prepared for ${item.title}`);
  else fail(`compare_reports failed for ${item.title}\nSTDERR:\n${result.stderr}`);
}

const ingest1 = runNode("packages/saoshu-scan-db/scripts/db_ingest_mode_diff.mjs", ["--db", dbDir, "--ledger", ledgerPath]);
if (ingest1.status === 0 && ingest1.stdout.includes("Mode-diff entries appended: 3")) ok("db_ingest_mode_diff ingests ledger entries");
else fail(`db_ingest_mode_diff first ingest failed\nSTDOUT:\n${ingest1.stdout}\nSTDERR:\n${ingest1.stderr}`);

const ingest2 = runNode("packages/saoshu-scan-db/scripts/db_ingest_mode_diff.mjs", ["--db", dbDir, "--ledger", ledgerPath]);
if (ingest2.status === 0 && ingest2.stdout.includes("Mode-diff entries skipped: 3")) ok("db_ingest_mode_diff skips duplicate ledger entries");
else fail(`db_ingest_mode_diff duplicate protection failed\nSTDOUT:\n${ingest2.stdout}\nSTDERR:\n${ingest2.stderr}`);

const overview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "mode-diff-overview", "--format", "json"]);
if (overview.status === 0) ok("db_query mode-diff overview run");
else fail(`db_query mode-diff overview failed\nSTDERR:\n${overview.stderr}`);

const overviewPayload = JSON.parse(overview.stdout || "{}");
if (overviewPayload.recommendation?.action === "evaluate_middle_mode" && overviewPayload.gain_window_counts?.gray === 3) ok("db_query mode-diff overview keeps cross-book recommendation");
else fail(`db_query mode-diff overview should expose recommendation and gray counts: ${JSON.stringify(overviewPayload)}`);

const textOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "overview", "--format", "text"]);
if (textOverview.status === 0 && textOverview.stdout.includes("Mode-diff entries: 3")) ok("db overview text surfaces mode-diff summary");
else fail(`db overview text should include mode-diff summary\nSTDOUT:\n${textOverview.stdout}\nSTDERR:\n${textOverview.stderr}`);

const dashboardPath = path.join(tmpRoot, "dashboard.html");
const dashboard = runNode("packages/saoshu-scan-db/scripts/db_dashboard.mjs", ["--db", dbDir, "--output", dashboardPath]);
if (dashboard.status === 0 && fs.existsSync(dashboardPath)) ok("db_dashboard renders mode-diff aware dashboard");
else fail(`db_dashboard failed\nSTDERR:\n${dashboard.stderr}`);

const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
if (dashboardHtml.includes("覆盖口径") && dashboardHtml.includes("兼容执行层") && dashboardHtml.indexOf("覆盖口径") < dashboardHtml.indexOf("兼容执行层")) ok("db_dashboard recent-runs table prefers coverage-first column ordering");
else fail("db_dashboard recent-runs table should prefer coverage-first column ordering");

if (dashboardHtml.includes("升级建议") && dashboardHtml.includes("建议把握") && dashboardHtml.includes("升级到 chapter-full") && dashboardHtml.includes("谨慎")) ok("db_dashboard surfaces coverage decision defaults");
else fail("db_dashboard should surface coverage decision defaults");

const trendsDir = path.join(tmpRoot, "trends");
const trends = runNode("packages/saoshu-scan-db/scripts/db_trends.mjs", ["--db", dbDir, "--output-dir", trendsDir]);
if (trends.status === 0 && fs.existsSync(path.join(trendsDir, "trends.json"))) ok("db_trends renders mode-diff aware trends outputs");
else fail(`db_trends failed\nSTDERR:\n${trends.stderr}`);

const trendsPayload = JSON.parse(fs.readFileSync(path.join(trendsDir, "trends.json"), "utf8"));
if (trendsPayload.mode_diff?.total_entries === 3 && Array.isArray(trendsPayload.mode_diff?.by_day)) ok("db_trends includes mode-diff trend payload");
else fail(`db_trends should include mode-diff trend payload: ${JSON.stringify(trendsPayload.mode_diff)}`);

if (!hasFailure) console.log("DB mode-diff integration check passed.");
else process.exitCode = 1;
