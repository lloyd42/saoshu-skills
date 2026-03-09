#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json, writeUtf8Jsonl } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
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
writeUtf8Jsonl(path.join(dbDir, "runs.jsonl"), [{ ingested_at: "2026-03-08T09:00:00Z", title: "仪表盘夹具", verdict: "慎入", rating: 5, reader_policy_preset: "community-default", reader_policy_label: "默认社区 preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", coverage_mode: "sampled", coverage_template: "opening-latest", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["late_risk_uncovered", "latest_progress_uncertain"], pipeline_mode: "economy", coverage_unit: "chapter", chapter_detect_used_mode: "script", serial_status: "ongoing", coverage_ratio: 0.5, coverage_gap_summary: "中后段仍未完整覆盖" }]);

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

const decisionOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "coverage-decision-overview", "--format", "json"]);
if (decisionOverview.status === 0) ok("db_query coverage decision overview run");
else fail(`db_query coverage decision overview failed\nSTDERR:\n${decisionOverview.stderr}`);

const decisionPayload = JSON.parse(decisionOverview.stdout || "{}");
if (Array.isArray(decisionPayload.action_dist)
  && decisionPayload.action_dist.some((item) => item[0] === "upgrade-chapter-full" && item[1] === 1)
  && Array.isArray(decisionPayload.reason_dist)
  && decisionPayload.reason_dist.some((item) => item[0] === "late_risk_uncovered" && item[1] === 1)
  && Array.isArray(decisionPayload.reader_policy_preset_dist)
  && decisionPayload.reader_policy_preset_dist.some((item) => item[0] === "community-default" && item[1] === 1)) ok("db_query coverage decision overview exposes action, reason, and reader-policy distribution");
else fail(`db_query coverage decision overview should expose action and reason distribution: ${JSON.stringify(decisionPayload)}`);

const decisionText = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "coverage-decision-overview", "--format", "text"]);
if (decisionText.status === 0
  && decisionText.stdout.includes("Coverage decision actions: 升级到 chapter-full(1)")
  && decisionText.stdout.includes("Coverage decision reasons: 中后段关键风险未覆盖(1) / 最新进度仍可能改判(1)")
  && decisionText.stdout.includes("Top reader policy presets: community-default(1)")) ok("db_query coverage decision overview renders readable text summary");
else fail(`db_query coverage decision overview should render readable text summary\nSTDOUT:\n${decisionText.stdout}\nSTDERR:\n${decisionText.stderr}`);

writeUtf8File(path.join(dbDir, "compare", "compare.html"), "<html><body>custom default compare</body></html>");
writeUtf8Json(path.join(dbDir, "compare", "compare.json"), {
  preset: "",
  dimensions: ["author", "mode_diff_gain_window"],
}, { newline: true });

const dashboardPath = path.join(tmpRoot, "dashboard.html");
const dashboard = runNode("packages/saoshu-scan-db/scripts/db_dashboard.mjs", ["--db", dbDir, "--output", dashboardPath]);
if (dashboard.status === 0 && fs.existsSync(dashboardPath)) ok("db_dashboard renders mode-diff aware dashboard");
else fail(`db_dashboard failed\nSTDERR:\n${dashboard.stderr}`);

if (fs.existsSync(path.join(dbDir, "compare", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-context", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-context-kinds", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-policy", "compare.html")) && fs.existsSync(path.join(dbDir, "trends", "trends.html"))) ok("db_dashboard auto-refreshes missing compare detail pages and trends page");
else fail("db_dashboard should auto-refresh missing compare detail pages");

if (fs.readFileSync(path.join(dbDir, "compare", "compare.html"), "utf8").includes("custom default compare")) ok("db_dashboard preserves custom compare pages");
else fail("db_dashboard should not overwrite custom compare pages");

const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
if (dashboardHtml.includes("覆盖口径") && dashboardHtml.includes("兼容执行层") && dashboardHtml.indexOf("覆盖口径") < dashboardHtml.indexOf("兼容执行层")) ok("db_dashboard recent-runs table prefers coverage-first column ordering");
else fail("db_dashboard recent-runs table should prefer coverage-first column ordering");

if (dashboardHtml.includes("升级建议") && dashboardHtml.includes("建议把握") && dashboardHtml.includes("升级到 chapter-full") && dashboardHtml.includes("谨慎")) ok("db_dashboard surfaces coverage decision defaults");
else fail("db_dashboard should surface coverage decision defaults");

if (dashboardHtml.includes("高频升级理由") && dashboardHtml.includes("中后段关键风险未覆盖") && dashboardHtml.includes("最新进度仍可能改判")) ok("db_dashboard surfaces coverage decision reasons");
else fail("db_dashboard should surface coverage decision reasons");

if (dashboardHtml.includes("读者策略视角") && dashboardHtml.includes("community-default(1)") && dashboardHtml.includes("默认社区 preset") && dashboardHtml.includes("balanced")) ok("db_dashboard surfaces reader policy overview and latest-run details");
else fail("db_dashboard should surface reader policy overview and latest-run details");

if (dashboardHtml.includes("趋势报告入口") && dashboardHtml.includes("打开 trends 详情") && dashboardHtml.includes("href=\"scan-db/trends/trends.html\"")) ok("db_dashboard links trends detail page after refresh");
else fail("db_dashboard should link trends detail page after refresh");

if (dashboardHtml.includes("Compare 详情入口") && !dashboardHtml.includes("saoshu_cli.mjs compare --db")) ok("db_dashboard prefers detail links over command snippets when compare pages are ready");
else fail("db_dashboard should prefer detail links over command snippets when compare pages are ready");

if (dashboardHtml.includes("点击查看详情") && dashboardHtml.includes("href=\"scan-db/compare/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-context/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-context-kinds/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-policy/compare.html\"")) ok("db_dashboard links compare detail pages after refresh");
else fail("db_dashboard should link compare detail pages after refresh");

const trendsDir = path.join(tmpRoot, "trends");
const trends = runNode("packages/saoshu-scan-db/scripts/db_trends.mjs", ["--db", dbDir, "--output-dir", trendsDir]);
if (trends.status === 0 && fs.existsSync(path.join(trendsDir, "trends.json"))) ok("db_trends renders mode-diff aware trends outputs");
else fail(`db_trends failed\nSTDERR:\n${trends.stderr}`);

const trendsPayload = JSON.parse(fs.readFileSync(path.join(trendsDir, "trends.json"), "utf8"));
if (trendsPayload.mode_diff?.total_entries === 3 && Array.isArray(trendsPayload.mode_diff?.by_day)) ok("db_trends includes mode-diff trend payload");
else fail(`db_trends should include mode-diff trend payload: ${JSON.stringify(trendsPayload.mode_diff)}`);

if (Array.isArray(trendsPayload.top_reader_policy_presets)
  && trendsPayload.top_reader_policy_presets.some((item) => item.name === "community-default" && item.count === 1)
  && Array.isArray(trendsPayload.top_reader_policy_thresholds)
  && trendsPayload.top_reader_policy_thresholds.some((item) => item.name === "balanced" && item.count === 1)
  && Array.isArray(trendsPayload.top_reader_policy_coverage_preferences)
  && trendsPayload.top_reader_policy_coverage_preferences.some((item) => item.name === "balanced" && item.count === 1)
  && Array.isArray(trendsPayload.reader_policy_customization_dist)
  && trendsPayload.reader_policy_customization_dist.some((item) => item.name === "no" && item.count === 1)) ok("db_trends includes reader policy trend payload");
else fail(`db_trends should include reader policy trend payload: ${JSON.stringify(trendsPayload)}`);

const trendsMd = fs.readFileSync(path.join(trendsDir, "trends.md"), "utf8");
if (trendsMd.includes("读者策略 preset Top") && trendsMd.includes("community-default: 1") && trendsMd.includes("自定义读者策略分布")) ok("db_trends markdown surfaces reader policy sections");
else fail("db_trends markdown should surface reader policy sections");

const trendsHtml = fs.readFileSync(path.join(trendsDir, "trends.html"), "utf8");
if (trendsHtml.includes("读者策略 preset Top") && trendsHtml.includes("community-default") && trendsHtml.includes("证据阈值 Top") && trendsHtml.includes("自定义读者策略分布")) ok("db_trends html surfaces reader policy sections");
else fail("db_trends html should surface reader policy sections");

if (!hasFailure) console.log("DB mode-diff integration check passed.");
else process.exitCode = 1;
