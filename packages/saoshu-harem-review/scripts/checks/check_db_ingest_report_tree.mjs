#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-db-ingest-report-tree");

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

function makeReport({ title, pipelineMode, coverageMode, coverageTemplate, action, confidence, reasons }) {
  return {
    generated_at: "2026-03-08T12:00:00Z",
    novel: { title, author: "作者甲", tags: "后宫/玄幻", target_defense: "布甲" },
    reader_policy: { preset: "community-default", label: "默认社区 preset", source: "fixture", customized: false, summary: "默认社区视角", hard_blocks: [], soft_risks: [], relation_constraints: [], evidence_threshold: "balanced", coverage_preference: "balanced", notes: [] },
    overall: { verdict: action === "keep-sampled" ? "可看" : "慎入", rating: action === "keep-sampled" ? 7 : 5 },
    scan: {
      batch_count: 2,
      batch_ids: ["B01", "B02"],
      sampling: {
        pipeline_mode: pipelineMode,
        coverage_mode: coverageMode,
        coverage_template: coverageTemplate,
        coverage_unit: coverageMode === "sampled" ? "chapter" : "segment",
        chapter_detect_used_mode: coverageMode === "chapter-full" ? "segment-fallback" : "script",
        serial_status: coverageMode === "sampled" ? "ongoing" : "completed",
        total_batches: 4,
        selected_batches: 2,
        coverage_ratio: 0.5,
        coverage_gap_summary: coverageMode === "sampled" ? "中后段仍未完整覆盖" : "",
        coverage_gap_risk_types: coverageMode === "sampled" ? ["阶段性变质"] : [],
      },
      coverage_decision: {
        action,
        confidence,
        reason_codes: reasons,
      },
    },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: [],
    events: { items: [] },
    metadata_summary: { top_tags: [{ name: "后宫", count: 1 }], relationships: [] },
  };
}

function makeLegacyReport({ title, pipelineMode, coverageRatio, totalBatches, selectedBatches, verdict, rating, riskCount }) {
  return {
    generated_at: "2026-03-07T12:00:00Z",
    novel: { title, author: "作者乙", tags: pipelineMode === "economy" ? "真实样本/待补充 [ECONOMY-SAMPLED]" : "真实样本/待补充 [PERFORMANCE-FULL]", target_defense: "布甲" },
    reader_policy: { preset: "custom-no-steal", label: "不能接受关键女主被抢", source: "fixture", customized: true, summary: "更关注关键女主关系主位", hard_blocks: ["送女"], soft_risks: [], relation_constraints: ["不能接受关键女主被抢/共享"], evidence_threshold: "strict", coverage_preference: "conservative", notes: [] },
    overall: { verdict, rating },
    decision_summary: {
      title: "决策区",
      verdict,
      rating,
      confidence: pipelineMode === "economy" ? "低" : "中",
      next_action: pipelineMode === "economy" ? "先确认自己是否介意未证实风险，再决定是否继续。" : "先确认自己是否介意未证实风险，再决定是否继续。",
    },
    scan: {
      coverage: pipelineMode === "economy" ? "B01: 第1-80章；B03: 第161-240章" : "B01: 第1-80章；B02: 第81-160章；B03: 第161-240章；B04: 第241-320章",
      batch_count: selectedBatches,
      batch_ids: Array.from({ length: selectedBatches }, (_, index) => `B${String(index + 1).padStart(2, "0")}`),
      ranges: Array.from({ length: selectedBatches }, (_, index) => `B${String(index + 1).padStart(2, "0")}: 第${index * 80 + 1}-${(index + 1) * 80}章`),
      sampling: {
        pipeline_mode: pipelineMode,
        sample_mode: pipelineMode === "economy" ? "dynamic" : "fixed",
        sample_level_effective: pipelineMode === "economy" ? "medium" : "auto",
        total_batches: totalBatches,
        selected_batches: selectedBatches,
        coverage_ratio: coverageRatio,
      },
    },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: Array.from({ length: riskCount }, (_, index) => ({ risk: `风险${index + 1}`, current_evidence: "线索", missing_evidence: "补证", impact: "若实锤将显著下调结论并可能直接劝退" })),
    follow_up_questions: Array.from({ length: Math.min(3, riskCount) }, (_, index) => `[风险${index + 1}] 需要补证`),
    events: { items: [] },
    metadata_summary: { top_tags: [{ name: "后宫", count: 1 }], relationships: [] },
  };
}

function writeReportDir(dir, report) {
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, "merged-report.json"), report);
  writeJson(path.join(dir, "pipeline-state.json"), { started_at: "2026-03-08T11:00:00Z", finished_at: "2026-03-08T12:00:00Z" });
  writeJson(path.join(dir, "manifest.json"), { input_txt: "./novel.txt", output_dir: "./workspace/out" });
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
const reportsRoot = path.join(tmpRoot, "reports");
const dbDir = path.join(tmpRoot, "scan-db");

writeReportDir(path.join(reportsRoot, "作品A", "performance"), makeReport({
  title: "作品A",
  pipelineMode: "performance",
  coverageMode: "chapter-full",
  coverageTemplate: "",
  action: "upgrade-full-book",
  confidence: "cautious",
  reasons: ["chapter_boundary_unstable"],
}));
writeReportDir(path.join(reportsRoot, "作品A", "economy"), makeReport({
  title: "作品A",
  pipelineMode: "economy",
  coverageMode: "sampled",
  coverageTemplate: "opening-latest",
  action: "upgrade-chapter-full",
  confidence: "insufficient",
  reasons: ["late_risk_uncovered", "latest_progress_uncertain"],
}));
writeReportDir(path.join(reportsRoot, "作品B", "performance"), makeReport({
  title: "作品B",
  pipelineMode: "performance",
  coverageMode: "chapter-full",
  coverageTemplate: "",
  action: "keep-current",
  confidence: "stable",
  reasons: [],
}));
writeReportDir(path.join(reportsRoot, "作品C", "economy"), makeLegacyReport({
  title: "作品C",
  pipelineMode: "economy",
  coverageRatio: 0.5,
  totalBatches: 4,
  selectedBatches: 2,
  verdict: "慎入",
  rating: 5,
  riskCount: 3,
}));
writeReportDir(path.join(reportsRoot, "作品C", "performance"), makeLegacyReport({
  title: "作品C",
  pipelineMode: "performance",
  coverageRatio: 1,
  totalBatches: 4,
  selectedBatches: 4,
  verdict: "可看",
  rating: 6,
  riskCount: 1,
}));

const ingestTree = runNode("packages/saoshu-scan-db/scripts/db_ingest_report_tree.mjs", ["--db", dbDir, "--root", reportsRoot]);
if (ingestTree.status === 0 && ingestTree.stdout.includes("Imported: 5")) ok("db_ingest_report_tree imports report tree");
else fail(`db_ingest_report_tree should import five reports\nSTDOUT:\n${ingestTree.stdout}\nSTDERR:\n${ingestTree.stderr}`);

const runsPath = path.join(dbDir, "runs.jsonl");
const runs = fs.readFileSync(runsPath, "utf8").trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
if (runs.length === 5) ok("db_ingest_report_tree writes five runs");
else fail(`db_ingest_report_tree should write five runs: ${runs.length}`);

if (runs.some((row) => row.coverage_decision_action === "upgrade-chapter-full") && runs.some((row) => Array.isArray(row.coverage_decision_reasons) && row.coverage_decision_reasons.includes("chapter_boundary_unstable"))) ok("db_ingest_report_tree preserves coverage decision fields");
else fail(`db_ingest_report_tree should preserve coverage decision fields: ${JSON.stringify(runs)}`);

if (runs.some((row) => row.reader_policy_preset === "community-default") && runs.some((row) => row.reader_policy_preset === "custom-no-steal" && row.has_reader_policy_customization === "yes")) ok("db_ingest_report_tree preserves reader policy fields");
else fail(`db_ingest_report_tree should preserve reader policy fields: ${JSON.stringify(runs)}`);

const legacyEconomy = runs.find((row) => row.title === "作品C" && row.pipeline_mode === "economy");
if (legacyEconomy?.coverage_contract_source === "legacy-inferred" && legacyEconomy?.coverage_mode === "sampled" && legacyEconomy?.coverage_decision_action === "upgrade-chapter-full") ok("db_ingest_report_tree infers legacy sampled coverage contract");
else fail(`db_ingest_report_tree should infer legacy sampled contract: ${JSON.stringify(legacyEconomy)}`);

const legacyPerformance = runs.find((row) => row.title === "作品C" && row.pipeline_mode === "performance");
if (legacyPerformance?.coverage_contract_source === "legacy-inferred" && legacyPerformance?.coverage_mode === "chapter-full" && legacyPerformance?.coverage_decision_action === "keep-current") ok("db_ingest_report_tree infers legacy performance coverage contract");
else fail(`db_ingest_report_tree should infer legacy performance contract: ${JSON.stringify(legacyPerformance)}`);

const ingestTreeAgain = runNode("packages/saoshu-scan-db/scripts/db_ingest_report_tree.mjs", ["--db", dbDir, "--root", reportsRoot]);
if (ingestTreeAgain.status === 0 && ingestTreeAgain.stdout.includes("Skipped: 5")) ok("db_ingest_report_tree skips already ingested reports on rerun");
else fail(`db_ingest_report_tree should skip duplicates on rerun\nSTDOUT:\n${ingestTreeAgain.stdout}\nSTDERR:\n${ingestTreeAgain.stderr}`);

const overview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "coverage-decision-overview", "--format", "text"]);
if (overview.status === 0
  && overview.stdout.includes("Coverage decision sources: reported(3) / legacy-inferred(2)")
  && overview.stdout.includes("Coverage decision actions:")
  && overview.stdout.includes("升级到 chapter-full(2)")
  && overview.stdout.includes("升级到 full-book(1)")
  && overview.stdout.includes("继续当前覆盖层(2)")
  && overview.stdout.includes("Top reader policy presets: community-default(3) / custom-no-steal(2)")) ok("db_ingest_report_tree enables coverage decision overview after tree ingest");
else fail(`coverage decision overview should be available after tree ingest\nSTDOUT:\n${overview.stdout}\nSTDERR:\n${overview.stderr}`);

if (!hasFailure) console.log("DB ingest report tree check passed.");
else process.exitCode = 1;
