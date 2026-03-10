#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheckHarness, createNodeCheckTestkit } from "../lib/check_testkit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-coverage-decision-focus");

const harness = createCheckHarness();
const { ok, fail, expectSuccess, hasFailures, expect } = harness;
const toolkit = createNodeCheckTestkit({ repoRoot, ok, fail });
const { ensureCleanDir, writeJson, readJson, runNode } = toolkit;
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

function buildMergeArgs({ batchDir, reportJson, reportMd, reportHtml, title, extraArgs, targetDefense = "布甲" }) {
  return [
    "--input", batchDir,
    "--output", reportMd,
    "--json-out", reportJson,
    "--html-out", reportHtml,
    "--title", title,
    "--author", "公开夹具",
    "--target-defense", targetDefense,
    "--pipeline-mode", "economy",
    ...extraArgs,
  ];
}

function runScenario({ scenarioKey, title, extraArgs, prepareBatches, assertReport, targetDefense }) {
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
    targetDefense,
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

function prepareSampledKeepScenario(batchDir) {
  createBatch(batchDir, "B01.json", {
    batch_id: "B01",
    range: "第1-60章",
    metadata: {
      sample_selection: {
        coverage_template: "head-tail",
        serial_status: "completed",
        notes: [{ selection_label: "开篇窗口", selection_detail: "首段重点确认", selection_priority: 1, selection_role: "opening-window" }],
      },
    },
  });

  createBatch(batchDir, "B02.json", {
    batch_id: "B02",
    range: "第301-360章",
    metadata: {
      sample_selection: {
        coverage_template: "head-tail",
        serial_status: "completed",
        notes: [{ selection_label: "结尾窗口", selection_detail: "结尾重点确认", selection_priority: 2, selection_role: "ending-window" }],
      },
    },
  });
}

function prepareLegacySampledScenario(batchDir) {
  createBatch(batchDir, "B01.json", {
    batch_id: "B01",
    range: "第1-80章",
    risk_unconfirmed: [
      { risk: "送女", current_evidence: "当前只看到谈判筹码层面的暗示", missing_evidence: "需确认后段是否真实发生", impact: "若实锤将显著下调建议" },
    ],
    event_candidates: [{
      event_id: "EL01",
      rule_candidate: "送女",
      category: "risk",
      status: "待补证",
      review_decision: "待补证",
      certainty: "low",
      confidence_score: 3,
      chapter_range: "第1-80章",
      timeline: "mainline",
      polarity: "uncertain",
      subject: { name: "苏梨", relation_label: "未婚妻" },
      target: { name: "敌国世子", relation_label: "风险对象" },
      signals: ["送女"],
      evidence: [{ chapter_num: 32, chapter_title: "议和", keyword: "送给", snippet: "群臣建议把苏梨送给敌国世子换停战" }],
      missing_evidence: ["需确认后段是否真实执行"],
    }],
  });

  createBatch(batchDir, "B04.json", {
    batch_id: "B04",
    range: "第241-320章",
  });
}

function prepareChapterFullKeepScenario(batchDir) {
  createBatch(batchDir, "B01.json", {
    batch_id: "B01",
    range: "第1-80章",
  });

  createBatch(batchDir, "B02.json", {
    batch_id: "B02",
    range: "第81-160章",
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

function preparePolicySensitiveScenario(batchDir) {
  createBatch(batchDir, "B01.json", {
    batch_id: "B01",
    range: "第1-90章",
    risk_unconfirmed: [
      { risk: "送女", current_evidence: "当前只看到政治联姻与交换筹码线索", missing_evidence: "需确认后期是否真实发生而非威胁", impact: "若实锤将直接劝退" },
    ],
    event_candidates: [{
      event_id: "EP1",
      rule_candidate: "送女",
      category: "risk",
      status: "待补证",
      review_decision: "待补证",
      certainty: "low",
      confidence_score: 4,
      chapter_range: "第1-90章",
      timeline: "mainline",
      polarity: "uncertain",
      subject: { name: "苏梨", relation_label: "女主" },
      target: { name: "外邦王子", relation_label: "风险对象" },
      signals: ["送女"],
      evidence: [{ chapter_num: 40, chapter_title: "议和", keyword: "送给", snippet: "群臣提议把苏梨送给外邦王子和亲" }],
      missing_evidence: ["需确认后期是否真实执行"],
    }],
  });
}

function assertSampledScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(coverageDecision.action === "upgrade-chapter-full", "sampled: action upgrades to chapter-full", `sampled: expected upgrade-chapter-full, got ${JSON.stringify(coverageDecision)}`);
  expect(coverageDecision.confidence === "insufficient", "sampled: confidence is insufficient", `sampled: expected insufficient confidence, got ${JSON.stringify(coverageDecision)}`);
  expect(["late_risk_uncovered", "latest_progress_uncertain", "too_many_unverified", "sensitive_defense_needs_more_evidence"].every((item) => reasonCodes.includes(item)), "sampled: keeps core reason codes", `sampled: missing core reason codes in ${JSON.stringify(reasonCodes)}`);
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

function assertChapterFullHoldScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(coverageDecision.action === "keep-current", "chapter-full-hold: action keeps current layer", `chapter-full-hold: expected keep-current, got ${JSON.stringify(coverageDecision)}`);
  expect(coverageDecision.confidence === "insufficient", "chapter-full-hold: confidence is insufficient", `chapter-full-hold: expected insufficient confidence, got ${JSON.stringify(coverageDecision)}`);
  expect(["too_many_unverified", "sensitive_defense_needs_more_evidence"].every((item) => reasonCodes.includes(item)), "chapter-full-hold: keeps unresolved and sensitive reasons", `chapter-full-hold: expected core reason codes in ${JSON.stringify(reasonCodes)}`);
  expect(report.decision_summary?.next_action === "当前 chapter-full 已覆盖主要风险区，先回看关键未证实风险再决定。", "chapter-full-hold: next action keeps chapter-full review wording", `chapter-full-hold: unexpected next_action ${JSON.stringify(report.decision_summary?.next_action)}`);
  expect(markdown.includes("建议动作：继续保持 chapter-full"), "chapter-full-hold: markdown renders keep-current wording", "chapter-full-hold: markdown should render keep-current chapter-full wording");
  expect(html.includes("建议动作：继续保持 chapter-full"), "chapter-full-hold: html renders keep-current wording", "chapter-full-hold: html should render keep-current chapter-full wording");
  expect(!markdown.includes("建议动作：升级到 full-book"), "chapter-full-hold: markdown avoids full-book upgrade wording", "chapter-full-hold: markdown should not upgrade to full-book");
}

function assertSampledKeepScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(coverageDecision.action === "keep-sampled", "sampled-keep: action keeps sampled", `sampled-keep: expected keep-sampled, got ${JSON.stringify(coverageDecision)}`);
  expect(coverageDecision.confidence === "stable", "sampled-keep: confidence is stable", `sampled-keep: expected stable confidence, got ${JSON.stringify(coverageDecision)}`);
  expect(reasonCodes.length === 0, "sampled-keep: no reason codes are emitted", `sampled-keep: expected no reason codes, got ${JSON.stringify(reasonCodes)}`);
  expect(report.decision_summary?.next_action === "当前快速摸底已够用，先确认自己是否介意未证实风险。", "sampled-keep: next action keeps quick-look wording", `sampled-keep: unexpected next_action ${JSON.stringify(report.decision_summary?.next_action)}`);
  expect(markdown.includes("建议动作：继续保持 sampled"), "sampled-keep: markdown renders keep-sampled wording", "sampled-keep: markdown should render keep-sampled wording");
  expect(html.includes("建议动作：继续保持 sampled"), "sampled-keep: html renders keep-sampled wording", "sampled-keep: html should render keep-sampled wording");
  expect(!markdown.includes("建议动作：升级到 chapter-full"), "sampled-keep: markdown avoids upgrade wording", "sampled-keep: markdown should not upgrade to chapter-full");
}

function assertLegacySampledScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(String(report.scan?.sampling?.coverage_mode || "") === "sampled", "legacy-sampled: inferred sampled coverage mode", `legacy-sampled: expected sampled coverage_mode, got ${JSON.stringify(report.scan?.sampling)}`);
  expect(["", "-"].includes(String(report.scan?.sampling?.coverage_template || "")), "legacy-sampled: leaves coverage template unset", `legacy-sampled: expected unset coverage_template, got ${JSON.stringify(report.scan?.sampling)}`);
  expect(coverageDecision.action === "upgrade-chapter-full", "legacy-sampled: action upgrades to chapter-full", `legacy-sampled: expected upgrade-chapter-full, got ${JSON.stringify(coverageDecision)}`);
  expect(reasonCodes.includes("late_risk_uncovered"), "legacy-sampled: emits generic undercoverage reason", `legacy-sampled: missing late_risk_uncovered in ${JSON.stringify(reasonCodes)}`);
  expect(Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("当前 sampled 只覆盖部分批次，中后段仍非完整覆盖")), "legacy-sampled: basis lines expose generic coverage gap", `legacy-sampled: expected generic gap hint in ${JSON.stringify(report.scan?.sampling?.basis_lines)}`);
  expect(markdown.includes("当前 sampled 只覆盖部分批次，中后段仍非完整覆盖"), "legacy-sampled: markdown exposes generic coverage gap", "legacy-sampled: markdown should include generic coverage gap hint");
  expect(html.includes("当前 sampled 只覆盖部分批次，中后段仍非完整覆盖"), "legacy-sampled: html exposes generic coverage gap", "legacy-sampled: html should include generic coverage gap hint");
}

function assertChapterFullKeepScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(coverageDecision.action === "keep-current", "chapter-full-keep: action keeps current layer", `chapter-full-keep: expected keep-current, got ${JSON.stringify(coverageDecision)}`);
  expect(coverageDecision.confidence === "stable", "chapter-full-keep: confidence is stable", `chapter-full-keep: expected stable confidence, got ${JSON.stringify(coverageDecision)}`);
  expect(reasonCodes.length === 0, "chapter-full-keep: no reason codes are emitted", `chapter-full-keep: expected no reason codes, got ${JSON.stringify(reasonCodes)}`);
  expect(report.decision_summary?.next_action === "当前 chapter-full 已足够，可直接基于当前结果继续判断。", "chapter-full-keep: next action keeps chapter-full wording", `chapter-full-keep: unexpected next_action ${JSON.stringify(report.decision_summary?.next_action)}`);
  expect(markdown.includes("建议动作：继续保持 chapter-full"), "chapter-full-keep: markdown renders keep-current wording", "chapter-full-keep: markdown should render keep-current chapter-full wording");
  expect(html.includes("建议动作：继续保持 chapter-full"), "chapter-full-keep: html renders keep-current wording", "chapter-full-keep: html should render keep-current chapter-full wording");
  expect(!markdown.includes("建议动作：升级到 full-book"), "chapter-full-keep: markdown avoids full-book upgrade wording", "chapter-full-keep: markdown should not upgrade to full-book");
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

function assertPolicySensitiveScenario({ report, markdown, html }) {
  const coverageDecision = report.scan?.coverage_decision || {};
  const reasonCodes = Array.isArray(coverageDecision.reason_codes) ? coverageDecision.reason_codes : [];
  expect(reasonCodes.includes("sensitive_defense_needs_more_evidence"), "policy-sensitive: strict reader policy can trigger sensitive evidence reason", `policy-sensitive: expected sensitive reason in ${JSON.stringify(reasonCodes)}`);
  expect((coverageDecision.reason_lines || []).some((item) => String(item).includes("证据阈值=strict")), "policy-sensitive: reason line mentions strict evidence threshold", `policy-sensitive: expected strict threshold line in ${JSON.stringify(coverageDecision.reason_lines)}`);
  expect(markdown.includes("证据阈值=strict"), "policy-sensitive: markdown exposes strict reader policy in coverage reason", "policy-sensitive: markdown should mention strict threshold");
  expect(html.includes("证据阈值=strict"), "policy-sensitive: html exposes strict reader policy in coverage reason", "policy-sensitive: html should mention strict threshold");
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
    scenarioKey: "sampled-keep-sampled",
    title: "升级建议聚焦：sampled-keep",
    extraArgs: [
      "--coverage-mode", "sampled",
      "--coverage-template", "head-tail",
      "--serial-status", "completed",
      "--sample-mode", "dynamic",
      "--sample-level", "auto",
      "--sample-level-effective", "medium",
      "--total-batches", "2",
      "--selected-batches", "2",
      "--sample-coverage-rate", "1",
    ],
    prepareBatches: prepareSampledKeepScenario,
    assertReport: assertSampledKeepScenario,
  });

  runScenario({
    scenarioKey: "sampled-legacy-partial",
    title: "升级建议聚焦：sampled-legacy",
    extraArgs: [
      "--sample-mode", "dynamic",
      "--sample-level", "auto",
      "--sample-level-effective", "medium",
      "--total-batches", "10",
      "--selected-batches", "2",
      "--sample-coverage-rate", "0.2",
    ],
    prepareBatches: prepareLegacySampledScenario,
    assertReport: assertLegacySampledScenario,
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
    scenarioKey: "chapter-full-hold",
    title: "升级建议聚焦：chapter-full-hold",
    extraArgs: [
      "--coverage-mode", "chapter-full",
      "--coverage-unit", "chapter",
      "--chapter-detect-used-mode", "script",
      "--total-batches", "18",
      "--selected-batches", "18",
      "--sample-coverage-rate", "1",
    ],
    prepareBatches: prepareChapterFullScenario,
    assertReport: assertChapterFullHoldScenario,
  });

  runScenario({
    scenarioKey: "chapter-full-keep-current",
    title: "升级建议聚焦：chapter-full-keep",
    extraArgs: [
      "--coverage-mode", "chapter-full",
      "--coverage-unit", "chapter",
      "--chapter-detect-used-mode", "script",
      "--total-batches", "2",
      "--selected-batches", "2",
      "--sample-coverage-rate", "1",
    ],
    prepareBatches: prepareChapterFullKeepScenario,
    assertReport: assertChapterFullKeepScenario,
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

  const policySensitiveRoot = path.join(tmpRoot, "policy-sensitive");
  ensureCleanDir(policySensitiveRoot);
  const policyPath = path.join(policySensitiveRoot, "reader-policy.json");
  writeJson(policyPath, {
    preset: "strict-no-steal",
    label: "证据严格且不能接受关键女主被抢",
    source: "test",
    summary: "该视角要求严格证据，并高度关注关键女主被抢/共享。",
    hard_blocks: ["送女"],
    soft_risks: [],
    relation_constraints: ["不能接受关键女主被抢/共享"],
    scope_rules: [],
    evidence_threshold: "strict",
    coverage_preference: "conservative",
    notes: [],
  });

  runScenario({
    scenarioKey: "sampled-policy-sensitive",
    title: "升级建议聚焦：sampled-policy-sensitive",
    targetDefense: "神防",
    extraArgs: [
      "--coverage-mode", "sampled",
      "--sample-mode", "dynamic",
      "--sample-level", "auto",
      "--sample-level-effective", "medium",
      "--total-batches", "10",
      "--selected-batches", "3",
      "--sample-coverage-rate", "0.3",
      "--reader-policy-file", policyPath,
    ],
    prepareBatches: preparePolicySensitiveScenario,
    assertReport: assertPolicySensitiveScenario,
  });

  if (!hasFailures()) console.log("Coverage decision focus check passed.");
  else process.exitCode = 1;
}

main();
