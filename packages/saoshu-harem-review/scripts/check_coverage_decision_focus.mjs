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

function expect(condition, successMessage, failureMessage) {
  if (condition) ok(successMessage);
  else fail(failureMessage);
}

function createBatch(batchDir, fileName, payload) {
  writeJson(path.join(batchDir, fileName), {
    batch_id: String(payload.batch_id || fileName.replace(/\.json$/i, "")),
    range: String(payload.range || "未命名范围"),
    metadata: {
      source: "check-fixture",
      chapter_title_scan: { score: 0, critical: false, hit_chapter_count: 0, hits: [] },
      ...(payload.metadata || {}),
    },
    thunder_hits: Array.isArray(payload.thunder_hits) ? payload.thunder_hits : [],
    depression_hits: Array.isArray(payload.depression_hits) ? payload.depression_hits : [],
    risk_unconfirmed: Array.isArray(payload.risk_unconfirmed) ? payload.risk_unconfirmed : [],
    event_candidates: Array.isArray(payload.event_candidates) ? payload.event_candidates : [],
    delta_relation: Array.isArray(payload.delta_relation) ? payload.delta_relation : [],
  });
}

function buildMergeArgs({ batchDir, reportJson, reportMd, reportHtml, title, extraArgs }) {
  return [
    "--input", batchDir,
    "--output", reportMd,
    "--json-out", reportJson,
    "--html-out", reportHtml,
    "--title", title,
    "--author", "公开夹具",
    "--target-defense", "布甲",
    "--pipeline-mode", "economy",
    ...extraArgs,
  ];
}

function runScenario({ scenarioKey, title, extraArgs, prepareBatches, assertReport }) {
  const scenarioRoot = path.join(tmpRoot, scenarioKey);
  ensureCleanDir(scenarioRoot);
  const batchDir = path.join(scenarioRoot, "batches");
  fs.mkdirSync(batchDir, { recursive: true });
  prepareBatches(batchDir);
  ok(`${scenarioKey}: prepared fixture`);

  const reportJson = path.join(scenarioRoot, "merged-report.json");
  const reportMd = path.join(scenarioRoot, "merged-report.md");
  const reportHtml = path.join(scenarioRoot, "merged-report.html");
  const result = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", buildMergeArgs({
    batchDir,
    reportJson,
    reportMd,
    reportHtml,
    title,
    extraArgs,
  }));
  expectSuccess(result, `${scenarioKey}: merge run`);
  if (result.status !== 0) return;

  const report = readJson(reportJson);
  const markdown = fs.readFileSync(reportMd, "utf8");
  const html = fs.readFileSync(reportHtml, "utf8");
  assertReport({ report, markdown, html });
}

function prepareSampledScenario(batchDir) {
  createBatch(batchDir, "B01.json", {
    batch_id: "B01",
    range: "第1-80章",
    metadata: {
      sample_selection: {
        coverage_template: "opening-latest",
        serial_status: "ongoing",
        notes: [{ selection_label: "开篇窗口", selection_detail: "覆盖前100章附近", selection_priority: 1, selection_role: "opening-window" }],
      },
    },
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
  });

  createBatch(batchDir, "B12.json", {
    batch_id: "B12",
    range: "第859-938章",
    metadata: {
      sample_selection: {
        coverage_template: "opening-latest",
        serial_status: "ongoing",
        notes: [{ selection_label: "最新进度窗口", selection_detail: "连载状态下优先覆盖最新章节", selection_priority: 2, selection_role: "latest-progress-window" }],
      },
    },
  });
}

function prepareChapterFullScenario(batchDir) {
  createBatch(batchDir, "B03.json", {
    batch_id: "B03",
    range: "第161-240章",
    risk_unconfirmed: [
      { risk: "送女", current_evidence: "女配被强行送作质押的线索已出现", missing_evidence: "需确认后续是否真的发生", impact: "若实锤将直接劝退" },
    ],
    event_candidates: [{
      event_id: "E31",
      rule_candidate: "送女",
      category: "risk",
      status: "待补证",
      review_decision: "待补证",
      certainty: "low",
      confidence_score: 4,
      chapter_range: "第161-240章",
      timeline: "mainline",
      polarity: "uncertain",
      subject: { name: "顾清漪", relation_label: "女主" },
      target: { name: "外邦王子", relation_label: "风险对象" },
      signals: ["送女"],
      evidence: [{ chapter_num: 203, chapter_title: "交换筹码", keyword: "送人", snippet: "群臣提出把顾清漪送去和亲" }],
      missing_evidence: ["需确认男主是否真正接受该安排"],
    }],
  });

  createBatch(batchDir, "B04.json", {
    batch_id: "B04",
    range: "第241-320章",
    risk_unconfirmed: [
      { risk: "背叛", current_evidence: "阵营摇摆仍未落地", missing_evidence: "需确认是否真实投敌", impact: "若实锤将改变结论" },
    ],
  });
}

function prepareFullBookScenario(batchDir) {
  createBatch(batchDir, "B01.json", {
    batch_id: "B01",
    range: "第1-120章",
    thunder_hits: [{ rule: "无", severity: "safe", evidence: "夹具只验证升级建议，不构造真实雷点" }],
  });

  createBatch(batchDir, "B08.json", {
    batch_id: "B08",
    range: "第841-960章",
  });
}

function assertSampledScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(coverageDecision.action === "upgrade-chapter-full", "sampled: action upgrades to chapter-full", `sampled: expected upgrade-chapter-full, got ${JSON.stringify(coverageDecision)}`);
  expect(coverageDecision.confidence === "insufficient", "sampled: confidence is insufficient", `sampled: expected insufficient confidence, got ${JSON.stringify(coverageDecision)}`);
  expect(["late_risk_uncovered", "latest_progress_uncertain", "too_many_unverified"].every((item) => reasonCodes.includes(item)), "sampled: keeps core reason codes", `sampled: missing core reason codes in ${JSON.stringify(reasonCodes)}`);
  expect(report.decision_summary?.next_action === "建议升级到 chapter-full。", "sampled: next action points to chapter-full", `sampled: unexpected next_action ${JSON.stringify(report.decision_summary?.next_action)}`);

  const coverageIndex = markdown.indexOf("## ⬆️ 覆盖升级建议");
  const decisionIndex = markdown.indexOf("## ✅ 一眼结论");
  const evidenceIndex = markdown.indexOf("## 🔍 为什么这样判断");
  expect(coverageIndex > decisionIndex && coverageIndex < evidenceIndex, "sampled: markdown keeps coverage section between decision and evidence", "sampled: markdown coverage section order is incorrect");
  expect(markdown.includes("建议动作：升级到 chapter-full"), "sampled: markdown renders chapter-full upgrade text", "sampled: markdown should render chapter-full upgrade text");
  expect(html.includes("建议动作：升级到 chapter-full"), "sampled: html renders chapter-full upgrade text", "sampled: html should render chapter-full upgrade text");
}

function assertChapterFullScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(coverageDecision.action === "upgrade-full-book", "chapter-full: action upgrades to full-book", `chapter-full: expected upgrade-full-book, got ${JSON.stringify(coverageDecision)}`);
  expect(["chapter_boundary_unstable", "too_many_unverified"].every((item) => reasonCodes.includes(item)), "chapter-full: keeps fallback and unresolved reasons", `chapter-full: expected chapter_boundary_unstable and too_many_unverified in ${JSON.stringify(reasonCodes)}`);
  expect(["insufficient", "cautious"].includes(coverageDecision.confidence), "chapter-full: confidence stays cautious or insufficient", `chapter-full: unexpected confidence ${JSON.stringify(coverageDecision)}`);
  expect(report.decision_summary?.next_action === "建议继续升级到 full-book，补齐整书连续证据。", "chapter-full: next action points to full-book continuation", `chapter-full: unexpected next_action ${JSON.stringify(report.decision_summary?.next_action)}`);
  expect(markdown.includes("建议动作：升级到 full-book"), "chapter-full: markdown renders full-book upgrade text", "chapter-full: markdown should render full-book upgrade text");
  expect(html.includes("建议动作：升级到 full-book"), "chapter-full: html renders full-book upgrade text", "chapter-full: html should render full-book upgrade text");
}

function assertFullBookScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  expect(coverageDecision.action === "keep-current", "full-book: action keeps current coverage", `full-book: expected keep-current, got ${JSON.stringify(coverageDecision)}`);
  expect(coverageDecision.confidence === "stable", "full-book: confidence is stable", `full-book: expected stable confidence, got ${JSON.stringify(coverageDecision)}`);
  expect(report.decision_summary?.next_action === "当前已是最高覆盖层，可直接基于当前结果决策。", "full-book: next action avoids self-upgrade wording", `full-book: unexpected next_action ${JSON.stringify(report.decision_summary?.next_action)}`);
  expect(markdown.includes("建议动作：当前已是 full-book"), "full-book: markdown renders keep-current wording", "full-book: markdown should render keep-current wording for full-book");
  expect(!markdown.includes("建议动作：升级到 full-book"), "full-book: markdown no longer self-upgrades", "full-book: markdown should not say upgrade to full-book");
  expect(html.includes("建议动作：当前已是 full-book"), "full-book: html renders keep-current wording", "full-book: html should render keep-current wording for full-book");
  expect(!html.includes("建议动作：升级到 full-book"), "full-book: html no longer self-upgrades", "full-book: html should not say upgrade to full-book");
}

function main() {
  ensureCleanDir(tmpRoot);

  runScenario({
    scenarioKey: "sampled-upgrade",
    title: "升级建议聚焦：sampled",
    extraArgs: [
      "--coverage-mode", "sampled",
      "--coverage-template", "opening-latest",
      "--serial-status", "ongoing",
      "--sample-mode", "dynamic",
      "--sample-level", "auto",
      "--sample-level-effective", "medium",
      "--total-batches", "12",
      "--selected-batches", "2",
      "--sample-coverage-rate", (2 / 12).toFixed(6),
    ],
    prepareBatches: prepareSampledScenario,
    assertReport: assertSampledScenario,
  });

  runScenario({
    scenarioKey: "chapter-full-upgrade",
    title: "升级建议聚焦：chapter-full",
    extraArgs: [
      "--coverage-mode", "chapter-full",
      "--coverage-unit", "chapter",
      "--chapter-detect-used-mode", "segment-fallback",
      "--total-batches", "18",
      "--selected-batches", "18",
      "--sample-coverage-rate", "1",
    ],
    prepareBatches: prepareChapterFullScenario,
    assertReport: assertChapterFullScenario,
  });

  runScenario({
    scenarioKey: "full-book-keep-current",
    title: "升级建议聚焦：full-book",
    extraArgs: [
      "--coverage-mode", "full-book",
      "--coverage-unit", "segment",
      "--chapter-detect-used-mode", "segment-full-book",
      "--total-batches", "8",
      "--selected-batches", "8",
      "--sample-coverage-rate", "1",
    ],
    prepareBatches: prepareFullBookScenario,
    assertReport: assertFullBookScenario,
  });

  if (!hasFailure) console.log("Coverage decision focus check passed.");
  else process.exitCode = 1;
}

main();