#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8Json } from "./lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-coverage-decision-focus");

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
  writeUtf8Json(filePath, payload, { newline: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runNode(scriptPath, args = []) {
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
  try {
    const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ? String(error.stdout) : "",
      stderr: error.stderr ? String(error.stderr) : String(error.message || error),
    };
  }
}

function expectSuccess(result, label) {
  if (result.status === 0) ok(label);
  else fail(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function createBatches(batchDir) {
  writeJson(path.join(batchDir, "B01.json"), {
    batch_id: "B01",
    range: "第1-80章",
    metadata: {
      source: "check-fixture",
      chapter_title_scan: { score: 0, critical: false, hit_chapter_count: 0, hits: [] },
      sample_selection: {
        coverage_template: "opening-latest",
        serial_status: "ongoing",
        notes: [{ selection_label: "开篇窗口", selection_detail: "覆盖前100章附近", selection_priority: 1, selection_role: "opening-window" }],
      },
    },
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [
      { risk: "背叛", current_evidence: "当前只看到阶段性误会", missing_evidence: "需确认后期是否真实脱离男主阵营", impact: "若实锤将改变结论" },
      { risk: "送女", current_evidence: "当前仅见威胁与暗示", missing_evidence: "需确认后期是否真实发生", impact: "若实锤将显著下调建议" },
    ],
    event_candidates: [{
      event_id: "E01",
      rule_candidate: "背叛",
      category: "risk",
      status: "待补证",
      review_decision: "待补证",
      certainty: "low",
      confidence_score: 3,
      chapter_range: "第1-80章",
      timeline: "mainline",
      polarity: "uncertain",
      subject: { name: "苏梨", relation_label: "未婚妻" },
      target: { name: "林舟", relation_label: "男主候选" },
      signals: ["背叛"],
      evidence: [{ chapter_num: 12, chapter_title: "风波", keyword: "背叛", snippet: "众人误会苏梨背叛林舟" }],
      missing_evidence: ["需确认是否只是伪装投敌"],
    }],
    delta_relation: [],
  });
  writeJson(path.join(batchDir, "B12.json"), {
    batch_id: "B12",
    range: "第859-938章",
    metadata: {
      source: "check-fixture",
      chapter_title_scan: { score: 0, critical: false, hit_chapter_count: 0, hits: [] },
      sample_selection: {
        coverage_template: "opening-latest",
        serial_status: "ongoing",
        notes: [{ selection_label: "最新进度窗口", selection_detail: "连载状态下优先覆盖最新章节", selection_priority: 2, selection_role: "latest-progress-window" }],
      },
    },
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [],
    delta_relation: [],
  });
}

function main() {
  ensureCleanDir(tmpRoot);
  const batchDir = path.join(tmpRoot, "batches");
  createBatches(batchDir);
  ok("prepared coverage decision focus fixture");

  const reportJson = path.join(tmpRoot, "merged-report.json");
  const reportMd = path.join(tmpRoot, "merged-report.md");
  const reportHtml = path.join(tmpRoot, "merged-report.html");
  const result = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
    "--input", batchDir,
    "--output", reportMd,
    "--json-out", reportJson,
    "--html-out", reportHtml,
    "--title", "升级建议聚焦",
    "--author", "公开夹具",
    "--target-defense", "布甲",
    "--pipeline-mode", "economy",
    "--coverage-mode", "sampled",
    "--coverage-template", "opening-latest",
    "--serial-status", "ongoing",
    "--sample-mode", "dynamic",
    "--sample-level", "auto",
    "--sample-level-effective", "medium",
    "--total-batches", "12",
    "--selected-batches", "2",
    "--sample-coverage-rate", (2 / 12).toFixed(6),
  ]);
  expectSuccess(result, "coverage decision focus merge run");

  const report = readJson(reportJson);
  const coverageDecision = report.scan?.coverage_decision || {};
  if (coverageDecision.action === "upgrade-chapter-full") ok("coverage decision emits chapter-full upgrade action");
  else fail(`coverage decision should recommend chapter-full: ${JSON.stringify(coverageDecision)}`);
  if (coverageDecision.confidence === "insufficient") ok("coverage decision emits insufficient confidence for stacked upgrade signals");
  else fail(`coverage decision should mark insufficient confidence: ${JSON.stringify(coverageDecision)}`);
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  if (["late_risk_uncovered", "latest_progress_uncertain", "too_many_unverified"].every((item) => reasonCodes.includes(item))) ok("coverage decision keeps core reason codes");
  else fail(`coverage decision should keep core reason codes: ${JSON.stringify(reasonCodes)}`);

  const markdown = fs.readFileSync(reportMd, "utf8");
  const coverageIndex = markdown.indexOf("## ⬆️ 覆盖升级建议");
  const decisionIndex = markdown.indexOf("## ✅ 一眼结论");
  const evidenceIndex = markdown.indexOf("## 🔍 为什么这样判断");
  if (coverageIndex > decisionIndex && coverageIndex < evidenceIndex) ok("markdown places coverage decision section between decision and evidence");
  else fail("markdown should place coverage decision section between decision and evidence");

  const html = fs.readFileSync(reportHtml, "utf8");
  if (html.includes("覆盖升级建议") && html.includes("建议动作：升级到 chapter-full")) ok("html decision area renders coverage upgrade card");
  else fail("html should render coverage upgrade card inside decision area");

  if (!hasFailure) console.log("Coverage decision focus check passed.");
  else process.exitCode = 1;
}

main();