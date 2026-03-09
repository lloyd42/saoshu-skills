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
  const isEconomy = pipelineMode === "economy";
  return {
    novel: { title, author },
    overall: { verdict, rating },
    reader_policy: {
      preset: "community-default",
      label: "默认社区 preset",
      source: "fixture",
      customized: false,
      summary: "默认社区视角",
      hard_blocks: [],
      soft_risks: [],
      relation_constraints: [],
      evidence_threshold: "balanced",
      coverage_preference: "balanced",
      notes: [],
    },
    scan: {
      batch_count: batchIds.length,
      batch_ids: batchIds,
      sampling: {
        pipeline_mode: pipelineMode,
        sample_mode: isEconomy ? "dynamic" : "fixed",
        sample_strategy: isEconomy ? "risk-aware" : "uniform",
        sample_level: "auto",
        sample_level_effective: isEconomy ? "medium" : "high",
        sample_level_recommended: isEconomy ? "medium" : "high",
        total_batches: totalBatches,
        selected_batches: batchIds.length,
        coverage_ratio: totalBatches ? batchIds.length / totalBatches : 0,
      },
      coverage_decision: {
        action: isEconomy ? "upgrade-chapter-full" : "keep-current",
        confidence: isEconomy ? "cautious" : "stable",
        reason_codes: isEconomy ? ["late_risk_uncovered", "latest_progress_uncertain"] : [],
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
if (textOverview.status === 0 && textOverview.stdout.includes("Mode-diff 样本数：3")) ok("db overview text surfaces mode-diff summary");
else fail(`db overview text should include mode-diff summary\nSTDOUT:\n${textOverview.stdout}\nSTDERR:\n${textOverview.stderr}`);

const decisionOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "coverage-decision-overview", "--format", "json"]);
if (decisionOverview.status === 0) ok("db_query coverage decision overview run");
else fail(`db_query coverage decision overview failed\nSTDERR:\n${decisionOverview.stderr}`);

const decisionPayload = JSON.parse(decisionOverview.stdout || "{}");
if (Array.isArray(decisionPayload.action_dist)
  && decisionPayload.action_dist.some((item) => item[0] === "upgrade-chapter-full" && item[1] === 1)
  && Array.isArray(decisionPayload.reason_dist)
  && decisionPayload.reason_dist.some((item) => item[0] === "late_risk_uncovered" && item[1] === 1)
  && Array.isArray(decisionPayload.calibration_by_action)
  && decisionPayload.calibration_by_action.some((item) => item.key === "upgrade-chapter-full" && item.gray_rate === 1)
  && Array.isArray(decisionPayload.calibration_by_reason)
  && decisionPayload.calibration_by_reason.some((item) => item.key === "late_risk_uncovered" && item.gray_rate === 1)
  && Array.isArray(decisionPayload.priority_review_actions)
  && decisionPayload.priority_review_actions.some((item) => item.key === "upgrade-chapter-full" && item.priority_score === 3)
  && Array.isArray(decisionPayload.priority_review_reasons)
  && decisionPayload.priority_review_reasons.some((item) => item.key === "late_risk_uncovered" && item.priority_score === 3)
  && decisionPayload.review_recommendation?.confidence_level === "strong"
  && decisionPayload.review_recommendation?.confidence_label === "强建议"
  && decisionPayload.review_recommendation?.evidence_strategy_type === "composite-bundle"
  && decisionPayload.review_recommendation?.evidence_strategy_label === "组合证据包"
  && decisionPayload.review_recommendation?.primary_focus_kind === "action-first"
  && decisionPayload.review_recommendation?.action_focus?.key === "upgrade-chapter-full"
  && decisionPayload.review_recommendation?.drill_down?.focus_dimension === "coverage_decision_action"
  && decisionPayload.review_recommendation?.drill_down?.secondary_focus_dimension === "coverage_decision_reason"
  && decisionPayload.review_recommendation?.evidence_preview?.type === "composite-bundle"
  && Array.isArray(decisionPayload.review_recommendation?.evidence_preview?.action_examples)
  && decisionPayload.review_recommendation.evidence_preview.action_examples[0]?.selection_label === "组合包-动作侧 · 同型 gray"
  && decisionPayload.review_recommendation.evidence_preview.action_examples[0]?.cluster_size === 3
  && Array.isArray(decisionPayload.review_recommendation?.evidence_preview?.reason_examples)
  && decisionPayload.review_recommendation.evidence_preview.reason_examples[0]?.selection_label === "组合包-理由侧 · 同型 gray"
  && decisionPayload.review_recommendation.evidence_preview.reason_examples[0]?.cluster_size === 3
  && decisionPayload.review_recommendation?.summary?.includes("强建议：本轮先查动作偏差")
  && Array.isArray(decisionPayload.reader_policy_preset_dist)
  && decisionPayload.reader_policy_preset_dist.some((item) => item[0] === "community-default" && item[1] === 1)) ok("db_query coverage decision overview exposes action, reason, and reader-policy distribution");
else fail(`db_query coverage decision overview should expose action and reason distribution: ${JSON.stringify(decisionPayload)}`);

const decisionText = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "coverage-decision-overview", "--format", "text"]);
if (decisionText.status === 0
  && decisionText.stdout.includes("覆盖升级建议：升级到章节级尽量完整(1)")
  && decisionText.stdout.includes("高频升级理由：中后段关键风险未覆盖(1) / 最新进度仍可能改判(1)")
  && decisionText.stdout.includes("升级动作校准快照：")
  && decisionText.stdout.includes("升级到章节级尽量完整 | 样本 3 | 灰区 100.0%")
  && decisionText.stdout.includes("升级理由校准快照：")
  && decisionText.stdout.includes("优先复审动作：")
  && decisionText.stdout.includes("优先分 3.00")
  && decisionText.stdout.includes("优先复审理由：")
  && decisionText.stdout.includes("建议强度：")
  && decisionText.stdout.includes("强建议 | 已有 3 条样本")
  && decisionText.stdout.includes("证据组织：")
  && decisionText.stdout.includes("组合证据包 | 动作层和理由层都在起作用")
  && decisionText.stdout.includes("自动建议：")
  && decisionText.stdout.includes("强建议：本轮先查动作偏差：升级到章节级尽量完整")
  && decisionText.stdout.includes("下钻建议：")
  && decisionText.stdout.includes("coverage_decision_action=upgrade-chapter-full")
  && decisionText.stdout.includes("再看 coverage_decision_reason=late_risk_uncovered")
  && decisionText.stdout.includes("下钻命令：")
  && decisionText.stdout.includes("compare-calibration")
  && decisionText.stdout.includes("建议证据：")
  && decisionText.stdout.includes("组合证据包 | 动作层和理由层都在起作用")
  && decisionText.stdout.includes("动作层样本：")
  && decisionText.stdout.includes("[组合包-动作侧 · 同型 gray]")
  && decisionText.stdout.includes("等 3 本")
  && decisionText.stdout.includes("理由层样本：")
  && decisionText.stdout.includes("[组合包-理由侧 · 同型 gray]")
  && decisionText.stdout.includes("高频读者策略预设：默认社区视角(1)")
  && decisionText.stdout.includes("高频证据阈值：平衡阈值(1)")
  && decisionText.stdout.includes("高频覆盖偏好：平衡覆盖(1)")) ok("db_query coverage decision overview renders readable text summary");
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

if (fs.existsSync(path.join(dbDir, "compare", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-calibration", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-context", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-context-kinds", "compare.html")) && fs.existsSync(path.join(dbDir, "compare-policy", "compare.html")) && fs.existsSync(path.join(dbDir, "trends", "trends.html"))) ok("db_dashboard auto-refreshes missing compare detail pages and trends page");
else fail("db_dashboard should auto-refresh missing compare detail pages");

if (fs.readFileSync(path.join(dbDir, "compare", "compare.html"), "utf8").includes("custom default compare")) ok("db_dashboard preserves custom compare pages");
else fail("db_dashboard should not overwrite custom compare pages");

const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
if (dashboardHtml.includes("覆盖口径") && dashboardHtml.includes("兼容执行层") && dashboardHtml.indexOf("覆盖口径") < dashboardHtml.indexOf("兼容执行层")) ok("db_dashboard recent-runs table prefers coverage-first column ordering");
else fail("db_dashboard recent-runs table should prefer coverage-first column ordering");

if (dashboardHtml.includes("升级建议") && dashboardHtml.includes("建议把握") && dashboardHtml.includes("升级到章节级尽量完整") && dashboardHtml.includes("谨慎")) ok("db_dashboard surfaces coverage decision defaults");
else fail("db_dashboard should surface coverage decision defaults");

if (dashboardHtml.includes("高频升级理由") && dashboardHtml.includes("中后段关键风险未覆盖") && dashboardHtml.includes("最新进度仍可能改判")) ok("db_dashboard surfaces coverage decision reasons");
else fail("db_dashboard should surface coverage decision reasons");

if (dashboardHtml.includes("升级动作校准快照") && dashboardHtml.includes("升级理由校准快照") && dashboardHtml.includes("灰区率") && dashboardHtml.includes("差距过大率")) ok("db_dashboard surfaces coverage calibration snapshots");
else fail("db_dashboard should surface coverage calibration snapshots");

if (dashboardHtml.includes("优先复审动作") && dashboardHtml.includes("优先复审理由") && dashboardHtml.includes("优先分 = 样本量 × (灰区率 + 2 × 差距过大率)")) ok("db_dashboard surfaces coverage review priorities");
else fail("db_dashboard should surface coverage review priorities");

if (dashboardHtml.includes("自动建议") && dashboardHtml.includes("建议强度") && dashboardHtml.includes("强建议") && dashboardHtml.includes("证据组织") && dashboardHtml.includes("组合证据包") && dashboardHtml.includes("本轮先查动作偏差：升级到章节级尽量完整") && dashboardHtml.includes("建议分层") && dashboardHtml.includes("打开 coverage-calibration 详情") && dashboardHtml.includes("建议用法")) ok("db_dashboard surfaces coverage review recommendation");
else fail("db_dashboard should surface coverage review recommendation");

if (dashboardHtml.includes("建议证据") && dashboardHtml.includes("解释标签") && dashboardHtml.includes("组合包-动作侧 · 同型 gray") && dashboardHtml.includes("组合包-理由侧 · 同型 gray") && dashboardHtml.includes("动作层样本") && dashboardHtml.includes("理由层样本") && dashboardHtml.includes("等 3 本") && dashboardHtml.includes("证据解释")) ok("db_dashboard surfaces recommendation evidence preview");
else fail("db_dashboard should surface recommendation evidence preview");

if (dashboardHtml.includes("读者策略视角") && dashboardHtml.includes("默认社区视角(1)") && dashboardHtml.includes("默认社区 preset") && dashboardHtml.includes("平衡阈值") && dashboardHtml.includes("快速摸底") && dashboardHtml.includes("快速摸底链路") && dashboardHtml.includes("按章节") && dashboardHtml.includes("脚本识别") && dashboardHtml.includes("连载中")) ok("db_dashboard surfaces reader policy overview and latest-run details");
else fail("db_dashboard should surface reader policy overview and latest-run details");

if (dashboardHtml.includes("趋势报告入口") && dashboardHtml.includes("打开趋势详情") && dashboardHtml.includes("href=\"scan-db/trends/trends.html\"")) ok("db_dashboard links trends detail page after refresh");
else fail("db_dashboard should link trends detail page after refresh");

if (dashboardHtml.includes("Compare 详情入口") && !dashboardHtml.includes("saoshu_cli.mjs compare --db")) ok("db_dashboard prefers detail links over command snippets when compare pages are ready");
else fail("db_dashboard should prefer detail links over command snippets when compare pages are ready");

if (dashboardHtml.includes("点击查看详情") && dashboardHtml.includes("href=\"scan-db/compare/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-calibration/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-context/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-context-kinds/compare.html\"") && dashboardHtml.includes("href=\"scan-db/compare-policy/compare.html\"")) ok("db_dashboard links compare detail pages after refresh");
else fail("db_dashboard should link compare detail pages after refresh");

const trendsDir = path.join(tmpRoot, "trends");
const trends = runNode("packages/saoshu-scan-db/scripts/db_trends.mjs", ["--db", dbDir, "--output-dir", trendsDir]);
if (trends.status === 0 && fs.existsSync(path.join(trendsDir, "trends.json")) && trends.stdout.includes("趋势 JSON：") && trends.stdout.includes("趋势 Markdown：") && trends.stdout.includes("趋势 HTML：")) ok("db_trends renders mode-diff aware trends outputs");
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
if (trendsMd.includes("Mode-diff 样本数") && trendsMd.includes("高频读者策略预设") && trendsMd.includes("默认社区视角: 1") && trendsMd.includes("自定义读者策略分布") && trendsMd.includes("默认: 1") && trendsMd.includes("平衡阈值: 1") && trendsMd.includes("平衡覆盖: 1")) ok("db_trends markdown surfaces reader policy sections");
else fail("db_trends markdown should surface reader policy sections");

const trendsHtml = fs.readFileSync(path.join(trendsDir, "trends.html"), "utf8");
if (trendsHtml.includes("Mode-diff 样本数") && trendsHtml.includes("高频读者策略预设") && trendsHtml.includes("默认社区视角") && trendsHtml.includes("高频证据阈值") && trendsHtml.includes("平衡阈值") && trendsHtml.includes("高频覆盖偏好") && trendsHtml.includes("平衡覆盖") && trendsHtml.includes("自定义读者策略分布") && trendsHtml.includes("默认")) ok("db_trends html surfaces reader policy sections");
else fail("db_trends html should surface reader policy sections");

if (!hasFailure) console.log("DB mode-diff integration check passed.");
else process.exitCode = 1;
