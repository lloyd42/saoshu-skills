#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8Jsonl } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-db-compare-feedback-metrics");

let hasFailure = false;

function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function writeJsonl(filePath, rows) {
  writeUtf8Jsonl(filePath, rows);
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

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const dbDir = path.join(tmpRoot, "scan-db");
const outDir = path.join(tmpRoot, "compare");
const calibrationOutDir = path.join(tmpRoot, "compare-calibration");
const presetOutDir = path.join(tmpRoot, "compare-preset");
const policyPresetOutDir = path.join(tmpRoot, "compare-policy-preset");
const overrideOutDir = path.join(tmpRoot, "compare-preset-override");
const sameCaseDbDir = path.join(tmpRoot, "scan-db-same-case");
const sameCaseDashboardPath = path.join(tmpRoot, "same-case-dashboard.html");
const sameCaseReasonDbDir = path.join(tmpRoot, "scan-db-same-case-reason");
const sameCaseReasonDashboardPath = path.join(tmpRoot, "same-case-reason-dashboard.html");
const compositeReasonDbDir = path.join(tmpRoot, "scan-db-composite-reason");
const compositeReasonDashboardPath = path.join(tmpRoot, "composite-reason-dashboard.html");

writeJsonl(path.join(dbDir, "runs.jsonl"), [
  { title: "A", author: "甲", tags: "后宫/玄幻", verdict: "慎入", rating: 5, thunder_total: 1, depression_total: 2, risk_total: 3, coverage_mode: "sampled", coverage_template: "opening-100", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["late_risk_uncovered", "too_many_unverified"], serial_status: "ongoing", coverage_ratio: 0.8, keyword_candidate_total: 4, alias_candidate_total: 2, risk_question_candidate_total: 3, relation_candidate_total: 1, context_reference_total: 6, context_reference_source_kinds: ["event_evidence", "event_counter_evidence", "summary_only"], counter_evidence_ref_total: 2, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "默认社区 preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "B", author: "甲", tags: "后宫/都市", verdict: "可看", rating: 7, thunder_total: 0, depression_total: 1, risk_total: 1, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "stable", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "completed", coverage_ratio: 0.9, keyword_candidate_total: 6, alias_candidate_total: 4, risk_question_candidate_total: 2, relation_candidate_total: 5, context_reference_total: 3, context_reference_source_kinds: ["event_evidence", "summary_only"], counter_evidence_ref_total: 0, offset_hint_ref_total: 2, reader_policy_preset: "custom-no-steal", reader_policy_label: "不能接受关键女主被抢", reader_policy_evidence_threshold: "strict", reader_policy_coverage_preference: "conservative", has_reader_policy_customization: "yes", reader_policy_hard_blocks: ["送女"], reader_policy_soft_risks: [], reader_policy_relation_constraints: ["不能接受关键女主被抢/共享"] },
]);

writeJsonl(path.join(dbDir, "mode_diff_entries.jsonl"), [
  {
    title: "A",
    author: "甲",
    tags: ["后宫", "玄幻"],
    coverage_mode: "sampled",
    coverage_template: "opening-100",
    coverage_decision_action: "upgrade-chapter-full",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: ["late_risk_uncovered", "too_many_unverified"],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 4.5,
    coverage_ratio: 0.75,
  },
  {
    title: "B",
    author: "甲",
    tags: ["后宫", "都市"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "keep-sampled",
    coverage_decision_confidence: "stable",
    coverage_decision_reasons: ["latest_progress_uncertain"],
    serial_status: "completed",
    reader_policy_preset: "custom-no-steal",
    reader_policy_evidence_threshold: "strict",
    reader_policy_coverage_preference: "conservative",
    has_reader_policy_customization: "yes",
    gain_window: "too_wide",
    band: "fallback_to_performance",
    score: 8.2,
    coverage_ratio: 0.4,
  },
]);

const result = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir, "--dimensions", "author,tags,coverage_mode,coverage_template,coverage_decision_action,coverage_decision_reason,reader_policy_preset,reader_policy_evidence_threshold,reader_policy_coverage_preference,has_reader_policy_customization,reader_policy_hard_block,reader_policy_relation_constraint,has_counter_evidence,has_offset_hints,context_reference_source_kind,serial_status,mode_diff_gain_window", "--output-dir", outDir]);
if (result.status === 0) ok("db_compare feedback metrics run");
else fail(`db_compare feedback metrics run failed\nSTDERR:\n${result.stderr}`);

const defaultResult = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir]);
if (defaultResult.status === 0) ok("db_compare default dimensions run");
else fail(`db_compare default dimensions run failed\nSTDERR:\n${defaultResult.stderr}`);

const calibrationPresetResult = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir, "--preset", "coverage-calibration", "--output-dir", calibrationOutDir]);
if (calibrationPresetResult.status === 0) ok("db_compare preset coverage-calibration run");
else fail(`db_compare preset coverage-calibration run failed\nSTDERR:\n${calibrationPresetResult.stderr}`);

const presetResult = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir, "--preset", "context-audit", "--output-dir", presetOutDir]);
if (presetResult.status === 0) ok("db_compare preset context-audit run");
else fail(`db_compare preset context-audit run failed\nSTDERR:\n${presetResult.stderr}`);

const policyPresetResult = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir, "--preset", "policy-audit", "--output-dir", policyPresetOutDir]);
if (policyPresetResult.status === 0) ok("db_compare preset policy-audit run");
else fail(`db_compare preset policy-audit run failed\nSTDERR:\n${policyPresetResult.stderr}`);

const presetOverrideResult = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir, "--preset", "context-audit", "--dimensions", "author,coverage_mode", "--output-dir", overrideOutDir]);
if (presetOverrideResult.status === 0) ok("db_compare preset override run");
else fail(`db_compare preset override run failed\nSTDERR:\n${presetOverrideResult.stderr}`);

const jsonPath = path.join(outDir, "compare.json");
if (fs.existsSync(jsonPath)) ok("db_compare writes compare.json");
else fail("db_compare should write compare.json");

const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const authorGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "author") : null;
const row = Array.isArray(authorGroup?.rows) ? authorGroup.rows.find((item) => item.key === "甲") : null;
if (row?.avg_keyword_candidates === 5 && row?.avg_alias_candidates === 3 && row?.avg_risk_questions === 2.5 && row?.avg_relations === 3) ok("db_compare aggregates feedback asset metrics into averages");
else fail(`db_compare should aggregate feedback asset metrics: ${JSON.stringify(row)}`);

if (row?.avg_context_references === 4.5 && row?.avg_counter_evidence_refs === 1 && row?.avg_offset_hint_refs === 1.5) ok("db_compare aggregates context reference metrics into averages");
else fail(`db_compare should aggregate context reference metrics: ${JSON.stringify(row)}`);

if (row?.mode_diff_entries === 2 && row?.gray_rate === 0.5 && row?.too_wide_rate === 0.5 && row?.avg_mode_diff_score === 6.35) ok("db_compare aggregates mode-diff metrics by author");
else fail(`db_compare should aggregate mode-diff metrics: ${JSON.stringify(row)}`);

const coverageModeGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "coverage_mode") : null;
const sampledRow = Array.isArray(coverageModeGroup?.rows) ? coverageModeGroup.rows.find((item) => item.key === "sampled") : null;
if (sampledRow?.runs === 2 && sampledRow?.avg_coverage === 0.85) ok("db_compare supports coverage_mode dimension");
else fail(`db_compare should expose coverage_mode dimension: ${JSON.stringify(sampledRow)}`);

const defaultPayload = JSON.parse(defaultResult.stdout || "{}");
const defaultDimensions = Array.isArray(defaultPayload.groups) ? defaultPayload.groups.map((item) => item.dimension) : [];
if (JSON.stringify(defaultDimensions.slice(0, 6)) === JSON.stringify(["author", "tags", "verdict", "coverage_mode", "coverage_template", "coverage_decision_action"])) ok("db_compare default dimensions prefer coverage-first ordering");
else fail(`db_compare default dimensions should prefer coverage-first ordering: ${JSON.stringify(defaultDimensions)}`);

const presetPayload = JSON.parse(fs.readFileSync(path.join(presetOutDir, "compare.json"), "utf8"));
if (presetPayload.preset === "context-audit" && JSON.stringify(presetPayload.dimensions) === JSON.stringify(["author", "tags", "coverage_mode", "coverage_decision_action", "coverage_decision_reason", "has_counter_evidence", "has_offset_hints"])) ok("db_compare preset context-audit resolves expected dimensions");
else fail(`db_compare preset context-audit should resolve expected dimensions: ${JSON.stringify(presetPayload)}`);

const calibrationPresetPayload = JSON.parse(fs.readFileSync(path.join(calibrationOutDir, "compare.json"), "utf8"));
if (calibrationPresetPayload.preset === "coverage-calibration" && JSON.stringify(calibrationPresetPayload.dimensions) === JSON.stringify(["coverage_mode", "coverage_template", "coverage_decision_action", "coverage_decision_confidence", "coverage_decision_reason", "serial_status", "target_defense", "reader_policy_evidence_threshold", "reader_policy_coverage_preference", "has_reader_policy_customization", "mode_diff_gain_window", "mode_diff_band"])) ok("db_compare preset coverage-calibration resolves expected dimensions");
else fail(`db_compare preset coverage-calibration should resolve expected dimensions: ${JSON.stringify(calibrationPresetPayload)}`);

const decisionOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "coverage-decision-overview", "--format", "json"]);
if (decisionOverview.status === 0) ok("db_query coverage decision overview run for calibration priority");
else fail(`db_query coverage decision overview for calibration priority failed\nSTDERR:\n${decisionOverview.stderr}`);

const decisionOverviewPayload = JSON.parse(decisionOverview.stdout || "{}");
if (Array.isArray(decisionOverviewPayload.priority_review_actions)
  && decisionOverviewPayload.priority_review_actions[0]?.key === "keep-sampled"
  && decisionOverviewPayload.priority_review_actions[0]?.priority_score === 2
  && decisionOverviewPayload.priority_review_actions[1]?.key === "upgrade-chapter-full"
  && decisionOverviewPayload.priority_review_actions[1]?.priority_score === 1) ok("coverage decision overview prioritizes actions by issue weight and sample count");
else fail(`coverage decision overview should prioritize actions by issue weight and sample count: ${JSON.stringify(decisionOverviewPayload.priority_review_actions)}`);

if (Array.isArray(decisionOverviewPayload.priority_review_reasons)
  && decisionOverviewPayload.priority_review_reasons[0]?.key === "latest_progress_uncertain"
  && decisionOverviewPayload.priority_review_reasons[0]?.priority_score === 2) ok("coverage decision overview prioritizes reasons by issue weight and sample count");
else fail(`coverage decision overview should prioritize reasons by issue weight and sample count: ${JSON.stringify(decisionOverviewPayload.priority_review_reasons)}`);

if (decisionOverviewPayload.review_recommendation?.primary_focus_kind === "action-first"
  && decisionOverviewPayload.review_recommendation?.action_focus?.key === "keep-sampled"
  && decisionOverviewPayload.review_recommendation?.reason_focus?.key === "latest_progress_uncertain"
  && decisionOverviewPayload.review_recommendation?.confidence_level === "hint"
  && decisionOverviewPayload.review_recommendation?.confidence_label === "仅提示"
  && decisionOverviewPayload.review_recommendation?.evidence_strategy_type === "observation-only"
  && decisionOverviewPayload.review_recommendation?.evidence_strategy_label === "观察为主"
  && decisionOverviewPayload.review_recommendation?.drill_down?.focus_dimension === "coverage_decision_action"
  && decisionOverviewPayload.review_recommendation?.evidence_preview?.type === "observation-only"
  && decisionOverviewPayload.review_recommendation?.evidence_preview?.sample_hints?.[0]?.title === "B"
  && decisionOverviewPayload.review_recommendation?.evidence_preview?.sample_hints?.[0]?.selection_label === "低样本观察 · 同型 too_wide"
  && decisionOverviewPayload.review_recommendation?.evidence_preview?.sample_hints?.[0]?.cluster_size === 1
  && String(decisionOverviewPayload.review_recommendation?.summary || "").includes("仅提示：本轮先查动作偏差")) ok("coverage decision overview emits review recommendation text");
else fail(`coverage decision overview should emit review recommendation text: ${JSON.stringify(decisionOverviewPayload.review_recommendation)}`);

writeJsonl(path.join(sameCaseDbDir, "runs.jsonl"), [
  { title: "C1", author: "乙", tags: "后宫/玄幻", verdict: "慎入", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: [], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 3, alias_candidate_total: 2, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 2, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "默认社区 preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "C2", author: "乙", tags: "后宫/都市", verdict: "慎入", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: [], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 3, alias_candidate_total: 2, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 2, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "默认社区 preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "C3", author: "乙", tags: "后宫/校园", verdict: "慎入", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: [], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 3, alias_candidate_total: 2, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 2, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "默认社区 preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
]);

writeJsonl(path.join(sameCaseDbDir, "mode_diff_entries.jsonl"), [
  {
    title: "C1",
    author: "乙",
    tags: ["后宫", "玄幻"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "upgrade-chapter-full",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: [],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 5.1,
    coverage_ratio: 0.5,
  },
  {
    title: "C2",
    author: "乙",
    tags: ["后宫", "都市"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "upgrade-chapter-full",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: [],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 5.3,
    coverage_ratio: 0.5,
  },
  {
    title: "C3",
    author: "乙",
    tags: ["后宫", "校园"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "upgrade-chapter-full",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: [],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 5.4,
    coverage_ratio: 0.5,
  },
]);

const sameCaseOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", sameCaseDbDir, "--metric", "coverage-decision-overview", "--format", "json"]);
if (sameCaseOverview.status === 0) ok("db_query coverage decision overview run for same-case representatives");
else fail(`db_query coverage decision overview for same-case representatives failed\nSTDERR:\n${sameCaseOverview.stderr}`);

const sameCasePayload = JSON.parse(sameCaseOverview.stdout || "{}");
if (sameCasePayload.review_recommendation?.confidence_level === "strong"
  && sameCasePayload.review_recommendation?.evidence_strategy_type === "same-case-representatives"
  && sameCasePayload.review_recommendation?.evidence_strategy_label === "同类代表证据"
  && sameCasePayload.review_recommendation?.primary_focus_kind === "action-first"
  && sameCasePayload.review_recommendation?.action_focus?.key === "upgrade-chapter-full"
  && sameCasePayload.review_recommendation?.drill_down?.focus_dimension === "coverage_decision_action"
  && sameCasePayload.review_recommendation?.evidence_preview?.type === "same-case-representatives"
  && Array.isArray(sameCasePayload.review_recommendation?.evidence_preview?.representatives)
  && sameCasePayload.review_recommendation.evidence_preview.representatives[0]?.selection_label === "同型 gray · 动作偏差"
  && sameCasePayload.review_recommendation.evidence_preview.representatives[0]?.cluster_size === 3
  && String(sameCasePayload.review_recommendation.evidence_preview.representatives[0]?.cluster_label || "").includes("等 3 本")
  && String(sameCasePayload.review_recommendation?.summary || "").includes("强建议：本轮先查动作偏差")) ok("coverage decision overview emits same-case representatives with explain labels");
else fail(`coverage decision overview should emit same-case representatives with explain labels: ${JSON.stringify(sameCasePayload.review_recommendation)}`);

const sameCaseText = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", sameCaseDbDir, "--metric", "coverage-decision-overview", "--format", "text"]);
if (sameCaseText.status === 0
  && sameCaseText.stdout.includes("证据组织：")
  && sameCaseText.stdout.includes("同类代表证据 | 当前主要是同一类动作或理由重复命中")
  && sameCaseText.stdout.includes("同类代表样本：")
  && sameCaseText.stdout.includes("[同型 gray · 动作偏差]")
  && sameCaseText.stdout.includes("等 3 本")
  && sameCaseText.stdout.includes("命中焦点：升级到章节级尽量完整")) ok("db_query coverage decision overview renders same-case representative text");
else fail(`db_query coverage decision overview should render same-case representative text\nSTDOUT:\n${sameCaseText.stdout}\nSTDERR:\n${sameCaseText.stderr}`);

const sameCaseDashboard = runNode("packages/saoshu-scan-db/scripts/db_dashboard.mjs", ["--db", sameCaseDbDir, "--output", sameCaseDashboardPath]);
if (sameCaseDashboard.status === 0 && fs.existsSync(sameCaseDashboardPath)) ok("db_dashboard renders same-case representative dashboard");
else fail(`db_dashboard same-case representative render failed\nSTDERR:\n${sameCaseDashboard.stderr}`);

const sameCaseDashboardHtml = fs.readFileSync(sameCaseDashboardPath, "utf8");
if (sameCaseDashboardHtml.includes("建议证据")
  && sameCaseDashboardHtml.includes("同类代表样本")
  && sameCaseDashboardHtml.includes("解释标签")
  && sameCaseDashboardHtml.includes("同型 gray · 动作偏差")
  && sameCaseDashboardHtml.includes("等 3 本")
  && sameCaseDashboardHtml.includes("同型 gray · 动作偏差</td><td>灰区</td><td>升级到章节级尽量完整</td>")
  && !sameCaseDashboardHtml.includes("升级到章节级尽量完整<div class=\"muted\">补充：")) ok("db_dashboard surfaces same-case representative evidence preview");
else fail("db_dashboard should surface same-case representative evidence preview");

writeJsonl(path.join(sameCaseReasonDbDir, "runs.jsonl"), [
  { title: "R1", author: "Gamma", tags: "harem/fantasy", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 3, alias_candidate_total: 2, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 2, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "R2", author: "Gamma", tags: "harem/urban", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 3, alias_candidate_total: 2, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 2, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "R3", author: "Gamma", tags: "harem/campus", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 3, alias_candidate_total: 2, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 2, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 1, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
]);

writeJsonl(path.join(sameCaseReasonDbDir, "mode_diff_entries.jsonl"), [
  {
    title: "R1",
    author: "Gamma",
    tags: ["harem", "fantasy"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "keep-sampled",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: ["latest_progress_uncertain"],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 5.1,
    coverage_ratio: 0.5,
  },
  {
    title: "R2",
    author: "Gamma",
    tags: ["harem", "urban"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "keep-sampled",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: ["latest_progress_uncertain"],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 5.2,
    coverage_ratio: 0.5,
  },
  {
    title: "R3",
    author: "Gamma",
    tags: ["harem", "campus"],
    coverage_mode: "sampled",
    coverage_template: "head-tail",
    coverage_decision_action: "upgrade-chapter-full",
    coverage_decision_confidence: "cautious",
    coverage_decision_reasons: ["latest_progress_uncertain"],
    serial_status: "ongoing",
    reader_policy_preset: "community-default",
    reader_policy_evidence_threshold: "balanced",
    reader_policy_coverage_preference: "balanced",
    has_reader_policy_customization: "no",
    gain_window: "gray",
    band: "enhance_economy",
    score: 5.4,
    coverage_ratio: 0.5,
  },
]);

const sameCaseReasonOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", sameCaseReasonDbDir, "--metric", "coverage-decision-overview", "--format", "json"]);
if (sameCaseReasonOverview.status === 0) ok("db_query coverage decision overview run for reason-first same-case representatives");
else fail(`db_query coverage decision overview for reason-first same-case representatives failed\nSTDERR:\n${sameCaseReasonOverview.stderr}`);

const sameCaseReasonPayload = JSON.parse(sameCaseReasonOverview.stdout || "{}");
if (sameCaseReasonPayload.review_recommendation?.confidence_level === "strong"
  && sameCaseReasonPayload.review_recommendation?.evidence_strategy_type === "same-case-representatives"
  && sameCaseReasonPayload.review_recommendation?.evidence_strategy_label === "同类代表证据"
  && sameCaseReasonPayload.review_recommendation?.primary_focus_kind === "reason-first"
  && sameCaseReasonPayload.review_recommendation?.reason_focus?.key === "latest_progress_uncertain"
  && sameCaseReasonPayload.review_recommendation?.drill_down?.focus_dimension === "coverage_decision_reason"
  && sameCaseReasonPayload.review_recommendation?.evidence_preview?.type === "same-case-representatives"
  && Array.isArray(sameCaseReasonPayload.review_recommendation?.evidence_preview?.representatives)
  && sameCaseReasonPayload.review_recommendation.evidence_preview.representatives[0]?.selection_label === "同型 gray · 理由失真"
  && sameCaseReasonPayload.review_recommendation.evidence_preview.representatives[0]?.cluster_size === 2
  && String(sameCaseReasonPayload.review_recommendation.evidence_preview.representatives[0]?.cluster_label || "").includes("等 2 本")
  && String(sameCaseReasonPayload.review_recommendation?.summary || "").includes("强建议：本轮先查理由失真")) ok("coverage decision overview emits reason-first same-case representatives with explain labels");
else fail(`coverage decision overview should emit reason-first same-case representatives with explain labels: ${JSON.stringify(sameCaseReasonPayload.review_recommendation)}`);

const sameCaseReasonText = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", sameCaseReasonDbDir, "--metric", "coverage-decision-overview", "--format", "text"]);
if (sameCaseReasonText.status === 0
  && sameCaseReasonText.stdout.includes("证据组织：")
  && sameCaseReasonText.stdout.includes("同类代表证据 | 当前主要是同一类动作或理由重复命中")
  && sameCaseReasonText.stdout.includes("同类代表样本：")
  && sameCaseReasonText.stdout.includes("[同型 gray · 理由失真]")
  && sameCaseReasonText.stdout.includes("等 2 本")
  && sameCaseReasonText.stdout.includes("命中焦点：最新进度仍可能改判")
  && sameCaseReasonText.stdout.includes("补充：继续快速摸底")) ok("db_query coverage decision overview renders reason-first same-case representative text");
else fail(`db_query coverage decision overview should render reason-first same-case representative text\nSTDOUT:\n${sameCaseReasonText.stdout}\nSTDERR:\n${sameCaseReasonText.stderr}`);

const sameCaseReasonDashboard = runNode("packages/saoshu-scan-db/scripts/db_dashboard.mjs", ["--db", sameCaseReasonDbDir, "--output", sameCaseReasonDashboardPath]);
if (sameCaseReasonDashboard.status === 0 && fs.existsSync(sameCaseReasonDashboardPath)) ok("db_dashboard renders reason-first same-case representative dashboard");
else fail(`db_dashboard reason-first same-case representative render failed\nSTDERR:\n${sameCaseReasonDashboard.stderr}`);

const sameCaseReasonDashboardHtml = fs.readFileSync(sameCaseReasonDashboardPath, "utf8");
if (sameCaseReasonDashboardHtml.includes("建议证据")
  && sameCaseReasonDashboardHtml.includes("同类代表样本")
  && sameCaseReasonDashboardHtml.includes("解释标签")
  && sameCaseReasonDashboardHtml.includes("同型 gray · 理由失真")
  && sameCaseReasonDashboardHtml.includes("等 2 本")
  && sameCaseReasonDashboardHtml.includes("同型 gray · 理由失真</td><td>灰区</td><td>最新进度仍可能改判<div class=\"muted\">补充：继续快速摸底</div>")) ok("db_dashboard surfaces reason-first same-case representative evidence preview");
else fail("db_dashboard should surface reason-first same-case representative evidence preview");

writeJsonl(path.join(compositeReasonDbDir, "runs.jsonl"), [
  { title: "X1", author: "Delta", tags: "harem/fantasy", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 1, alias_candidate_total: 1, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 1, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 0, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "X2", author: "Delta", tags: "harem/urban", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 1, alias_candidate_total: 1, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 1, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 0, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "X3", author: "Delta", tags: "harem/campus", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 1, alias_candidate_total: 1, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 1, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 0, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
  { title: "X4", author: "Delta", tags: "harem/scifi", verdict: "review", rating: 5, thunder_total: 0, depression_total: 1, risk_total: 2, coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", coverage_ratio: 0.5, keyword_candidate_total: 1, alias_candidate_total: 1, risk_question_candidate_total: 1, relation_candidate_total: 1, context_reference_total: 1, context_reference_source_kinds: ["event_evidence"], counter_evidence_ref_total: 0, offset_hint_ref_total: 0, reader_policy_preset: "community-default", reader_policy_label: "community preset", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", reader_policy_hard_blocks: [], reader_policy_soft_risks: [], reader_policy_relation_constraints: [] },
]);

writeJsonl(path.join(compositeReasonDbDir, "mode_diff_entries.jsonl"), [
  { title: "X1", author: "Delta", tags: ["harem", "fantasy"], coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", reader_policy_preset: "community-default", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", gain_window: "gray", band: "enhance_economy", score: 5.1, coverage_ratio: 0.5 },
  { title: "X2", author: "Delta", tags: ["harem", "urban"], coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", reader_policy_preset: "community-default", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", gain_window: "gray", band: "enhance_economy", score: 5.2, coverage_ratio: 0.5 },
  { title: "X3", author: "Delta", tags: ["harem", "campus"], coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "keep-sampled", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", reader_policy_preset: "community-default", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", gain_window: "gray", band: "enhance_economy", score: 5.3, coverage_ratio: 0.5 },
  { title: "X4", author: "Delta", tags: ["harem", "scifi"], coverage_mode: "sampled", coverage_template: "head-tail", coverage_decision_action: "upgrade-chapter-full", coverage_decision_confidence: "cautious", coverage_decision_reasons: ["latest_progress_uncertain"], serial_status: "ongoing", reader_policy_preset: "community-default", reader_policy_evidence_threshold: "balanced", reader_policy_coverage_preference: "balanced", has_reader_policy_customization: "no", gain_window: "gray", band: "enhance_economy", score: 5.4, coverage_ratio: 0.5 },
]);

const compositeReasonOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", compositeReasonDbDir, "--metric", "coverage-decision-overview", "--format", "json"]);
if (compositeReasonOverview.status === 0) ok("db_query coverage decision overview run for reason-first composite bundle");
else fail(`db_query coverage decision overview for reason-first composite bundle failed\nSTDERR:\n${compositeReasonOverview.stderr}`);

const compositeReasonPayload = JSON.parse(compositeReasonOverview.stdout || "{}");
if (compositeReasonPayload.review_recommendation?.primary_focus_kind === "reason-first"
  && compositeReasonPayload.review_recommendation?.evidence_strategy_type === "composite-bundle"
  && Array.isArray(compositeReasonPayload.review_recommendation?.evidence_preview?.action_examples)
  && compositeReasonPayload.review_recommendation.evidence_preview.action_examples.length === 1
  && compositeReasonPayload.review_recommendation.evidence_preview.action_examples[0]?.cluster_size === 3
  && compositeReasonPayload.review_recommendation.evidence_preview.action_examples[0]?.focus_value_label === "继续快速摸底"
  && Array.isArray(compositeReasonPayload.review_recommendation?.evidence_preview?.reason_examples)
  && compositeReasonPayload.review_recommendation.evidence_preview.reason_examples.length === 2
  && compositeReasonPayload.review_recommendation.evidence_preview.reason_examples[0]?.focus_value_label === "最新进度仍可能改判"
  && compositeReasonPayload.review_recommendation.evidence_preview.reason_examples.some((item) => item.secondary_value_label === "升级到章节级尽量完整")) ok("coverage decision overview keeps reason-first composite bundle action and reason rows separated");
else fail(`coverage decision overview should keep reason-first composite bundle rows separated: ${JSON.stringify(compositeReasonPayload.review_recommendation)}`);

const compositeReasonText = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", compositeReasonDbDir, "--metric", "coverage-decision-overview", "--format", "text"]);
if (compositeReasonText.status === 0
  && compositeReasonText.stdout.includes("动作层样本：")
  && compositeReasonText.stdout.includes("[组合包-动作侧 · 同型 gray] X3 等 3 本 | 灰区 | 命中焦点：继续快速摸底 | 补充：最新进度仍可能改判")
  && compositeReasonText.stdout.includes("理由层样本：")
  && compositeReasonText.stdout.includes("[组合包-理由侧 · 同型 gray] X4 | 灰区 | 命中焦点：最新进度仍可能改判 | 补充：升级到章节级尽量完整")) ok("db_query coverage decision overview renders reason-first composite bundle with separated focus rows");
else fail(`db_query coverage decision overview should render reason-first composite bundle with separated focus rows\nSTDOUT:\n${compositeReasonText.stdout}\nSTDERR:\n${compositeReasonText.stderr}`);

const compositeReasonDashboard = runNode("packages/saoshu-scan-db/scripts/db_dashboard.mjs", ["--db", compositeReasonDbDir, "--output", compositeReasonDashboardPath]);
if (compositeReasonDashboard.status === 0 && fs.existsSync(compositeReasonDashboardPath)) ok("db_dashboard renders reason-first composite bundle dashboard");
else fail(`db_dashboard reason-first composite bundle render failed\nSTDERR:\n${compositeReasonDashboard.stderr}`);

const compositeReasonDashboardHtml = fs.readFileSync(compositeReasonDashboardPath, "utf8");
if (compositeReasonDashboardHtml.includes("动作层样本")
  && compositeReasonDashboardHtml.includes("理由层样本")
  && compositeReasonDashboardHtml.includes("X3 等 3 本")
  && compositeReasonDashboardHtml.includes("X4</td><td>组合包-理由侧 · 同型 gray</td><td>灰区</td><td>最新进度仍可能改判<div class=\"muted\">补充：升级到章节级尽量完整</div></td><td>快速摸底 / 首尾窗口</td>")) ok("db_dashboard keeps reason-first composite bundle rows separated");
else fail("db_dashboard should keep reason-first composite bundle rows separated");

const policyPresetPayload = JSON.parse(fs.readFileSync(path.join(policyPresetOutDir, "compare.json"), "utf8"));
if (policyPresetPayload.preset === "policy-audit" && JSON.stringify(policyPresetPayload.dimensions) === JSON.stringify(["author", "tags", "reader_policy_preset", "reader_policy_evidence_threshold", "reader_policy_coverage_preference", "has_reader_policy_customization", "coverage_decision_action"])) ok("db_compare preset policy-audit resolves expected dimensions");
else fail(`db_compare preset policy-audit should resolve expected dimensions: ${JSON.stringify(policyPresetPayload)}`);

const presetOverridePayload = JSON.parse(fs.readFileSync(path.join(overrideOutDir, "compare.json"), "utf8"));
if (presetOverridePayload.preset === "context-audit" && JSON.stringify(presetOverridePayload.dimensions) === JSON.stringify(["author", "coverage_mode"])) ok("db_compare explicit dimensions override preset");
else fail(`db_compare explicit dimensions should override preset: ${JSON.stringify(presetOverridePayload)}`);

const coverageTemplateGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "coverage_template") : null;
const headTailRow = Array.isArray(coverageTemplateGroup?.rows) ? coverageTemplateGroup.rows.find((item) => item.key === "head-tail") : null;
if (headTailRow?.runs === 1 && headTailRow?.avg_coverage === 0.9) ok("db_compare supports coverage_template dimension");
else fail(`db_compare should expose coverage_template dimension: ${JSON.stringify(headTailRow)}`);

const coverageDecisionGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "coverage_decision_action") : null;
const upgradeRow = Array.isArray(coverageDecisionGroup?.rows) ? coverageDecisionGroup.rows.find((item) => item.key === "upgrade-chapter-full") : null;
if (upgradeRow?.runs === 1 && upgradeRow?.avg_coverage === 0.8 && upgradeRow?.mode_diff_entries === 1 && upgradeRow?.gray_rate === 1) ok("db_compare supports coverage_decision_action dimension");
else fail(`db_compare should expose coverage_decision_action dimension: ${JSON.stringify(upgradeRow)}`);

const coverageReasonGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "coverage_decision_reason") : null;
const lateRiskRow = Array.isArray(coverageReasonGroup?.rows) ? coverageReasonGroup.rows.find((item) => item.key === "late_risk_uncovered") : null;
if (lateRiskRow?.runs === 1 && lateRiskRow?.avg_coverage === 0.8 && lateRiskRow?.mode_diff_entries === 1 && lateRiskRow?.gray_rate === 1) ok("db_compare supports coverage_decision_reason dimension");
else fail(`db_compare should expose coverage_decision_reason dimension: ${JSON.stringify(lateRiskRow)}`);

const counterEvidenceGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "has_counter_evidence") : null;
const hasCounterRow = Array.isArray(counterEvidenceGroup?.rows) ? counterEvidenceGroup.rows.find((item) => item.key === "yes") : null;
if (hasCounterRow?.runs === 1 && hasCounterRow?.avg_counter_evidence_refs === 2) ok("db_compare supports has_counter_evidence dimension");
else fail(`db_compare should expose has_counter_evidence dimension: ${JSON.stringify(hasCounterRow)}`);

const offsetHintGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "has_offset_hints") : null;
const hasOffsetRow = Array.isArray(offsetHintGroup?.rows) ? offsetHintGroup.rows.find((item) => item.key === "yes") : null;
if (hasOffsetRow?.runs === 2 && hasOffsetRow?.avg_offset_hint_refs === 1.5) ok("db_compare supports has_offset_hints dimension");
else fail(`db_compare should expose has_offset_hints dimension: ${JSON.stringify(hasOffsetRow)}`);

const contextSourceGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "context_reference_source_kind") : null;
const counterSourceRow = Array.isArray(contextSourceGroup?.rows) ? contextSourceGroup.rows.find((item) => item.key === "event_counter_evidence") : null;
if (counterSourceRow?.runs === 1 && counterSourceRow?.avg_context_references === 6) ok("db_compare supports context_reference_source_kind dimension");
else fail(`db_compare should expose context_reference_source_kind dimension: ${JSON.stringify(counterSourceRow)}`);

const serialStatusGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "serial_status") : null;
const completedRow = Array.isArray(serialStatusGroup?.rows) ? serialStatusGroup.rows.find((item) => item.key === "completed") : null;
if (completedRow?.runs === 1 && completedRow?.avg_coverage === 0.9) ok("db_compare supports serial_status dimension");
else fail(`db_compare should expose serial_status dimension: ${JSON.stringify(completedRow)}`);

const gainWindowGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "mode_diff_gain_window") : null;
const tooWideRow = Array.isArray(gainWindowGroup?.rows) ? gainWindowGroup.rows.find((item) => item.key === "too_wide") : null;
if (tooWideRow?.mode_diff_entries === 1 && tooWideRow?.too_wide_rate === 1) ok("db_compare supports mode_diff_gain_window dimension");
else fail(`db_compare should expose mode_diff_gain_window dimension: ${JSON.stringify(tooWideRow)}`);

const readerPolicyPresetGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "reader_policy_preset") : null;
const customPolicyRow = Array.isArray(readerPolicyPresetGroup?.rows) ? readerPolicyPresetGroup.rows.find((item) => item.key === "custom-no-steal") : null;
if (customPolicyRow?.runs === 1 && customPolicyRow?.avg_rating === 7) ok("db_compare supports reader_policy_preset dimension");
else fail(`db_compare should expose reader_policy_preset dimension: ${JSON.stringify(customPolicyRow)}`);

const readerPolicyThresholdGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "reader_policy_evidence_threshold") : null;
const strictPolicyRow = Array.isArray(readerPolicyThresholdGroup?.rows) ? readerPolicyThresholdGroup.rows.find((item) => item.key === "strict") : null;
if (strictPolicyRow?.runs === 1 && strictPolicyRow?.avg_coverage === 0.9) ok("db_compare supports reader_policy_evidence_threshold dimension");
else fail(`db_compare should expose reader_policy_evidence_threshold dimension: ${JSON.stringify(strictPolicyRow)}`);

const readerPolicyCustomizationGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "has_reader_policy_customization") : null;
const customYesRow = Array.isArray(readerPolicyCustomizationGroup?.rows) ? readerPolicyCustomizationGroup.rows.find((item) => item.key === "yes") : null;
if (customYesRow?.runs === 1 && customYesRow?.avg_rating === 7) ok("db_compare supports has_reader_policy_customization dimension");
else fail(`db_compare should expose has_reader_policy_customization dimension: ${JSON.stringify(customYesRow)}`);

const readerPolicyHardBlockGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "reader_policy_hard_block") : null;
const sendGirlBlockRow = Array.isArray(readerPolicyHardBlockGroup?.rows) ? readerPolicyHardBlockGroup.rows.find((item) => item.key === "送女") : null;
if (sendGirlBlockRow?.runs === 1 && sendGirlBlockRow?.avg_coverage === 0.9) ok("db_compare supports reader_policy_hard_block dimension");
else fail(`db_compare should expose reader_policy_hard_block dimension: ${JSON.stringify(sendGirlBlockRow)}`);

const policyCompareMd = fs.readFileSync(path.join(policyPresetOutDir, "compare.md"), "utf8");
if (policyCompareMd.includes("## 维度：读者策略预设")
  && policyCompareMd.includes("## 维度：证据阈值")
  && policyCompareMd.includes("## 维度：覆盖偏好")
  && policyCompareMd.includes("## 维度：是否自定义策略")
  && policyCompareMd.includes("## 维度：升级建议")
  && policyCompareMd.includes("默认社区视角")
  && policyCompareMd.includes("关键女主防抢视角")
  && policyCompareMd.includes("平衡阈值")
  && policyCompareMd.includes("保守覆盖")
  && policyCompareMd.includes("继续快速摸底")
  && policyCompareMd.includes("补强快速摸底")) ok("db_compare markdown renders reader-facing labels");
else fail("db_compare markdown should render reader-facing labels");

const policyCompareHtml = fs.readFileSync(path.join(policyPresetOutDir, "compare.html"), "utf8");
if (policyCompareHtml.includes("维度：读者策略预设")
  && policyCompareHtml.includes("默认社区视角")
  && policyCompareHtml.includes("关键女主防抢视角")
  && policyCompareHtml.includes("平衡阈值")
  && policyCompareHtml.includes("保守覆盖")
  && policyCompareHtml.includes("继续快速摸底")
  && policyCompareHtml.includes("补强快速摸底")) ok("db_compare html renders reader-facing labels");
else fail("db_compare html should render reader-facing labels");

if (!hasFailure) console.log("DB compare feedback metrics check passed.");
else process.exitCode = 1;
