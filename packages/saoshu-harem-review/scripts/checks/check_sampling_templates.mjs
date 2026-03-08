#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheckHarness, createNodeCheckTestkit } from "../lib/check_testkit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-sampling-templates");

const harness = createCheckHarness();
const { ok, fail, expectSuccess, hasFailures } = harness;
const toolkit = createNodeCheckTestkit({ repoRoot, ok, fail });
const { ensureCleanDir, writeJson, readJson, runNode } = toolkit;
function listSelectedBatchIds(outputDir) {
  return fs.readdirSync(outputDir)
    .filter((file) => /^B\d+\.json$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => readJson(path.join(outputDir, file)).batch_id || file.replace(/\.json$/i, ""));
}

function createBatch(dir, index, options = {}) {
  const stride = 78;
  const start = 1 + (index - 1) * stride;
  const end = start + 79;
  const batchId = `B${String(index).padStart(2, "0")}`;
  const thunderHits = Array.isArray(options.thunderRules)
    ? options.thunderRules.map((rule, offset) => ({ rule, anchor: `第${start + offset}章` }))
    : [];
  const depressionHits = Array.from({ length: Number(options.depressionCount || 0) }, (_, offset) => ({
    rule: `夹具郁闷${offset + 1}`,
    summary: `夹具郁闷 ${offset + 1}`,
    severity: "中等",
    min_defense: "布甲",
    evidence_level: "未知待证",
    anchor: `第${start + offset}章`,
    batch_id: batchId,
  }));
  const riskUnconfirmed = Array.isArray(options.riskRules)
    ? options.riskRules.map((risk, offset) => ({ risk, current_evidence: `夹具风险${offset + 1}` }))
    : [];
  writeJson(path.join(dir, `${batchId}.json`), {
    batch_id: batchId,
    range: `第${start}-${end}章`,
    metadata: {
      source: "check-fixture",
      top_tags: [],
      top_characters: [],
      top_signals: [],
      chapter_title_scan: {
        score: Number(options.titleScore || 0),
        critical: Boolean(options.titleCritical),
        hit_chapter_count: Number(options.titleScore || 0) > 0 ? 1 : 0,
        hits: Number(options.titleScore || 0) > 0 ? [{
          chapter_num: start,
          chapter_title: `第${start}章 夹具`,
          type: "risk",
          rule: String(options.titleRule || "背叛"),
          matched: String(options.titleMatched || "背叛"),
          weight: Number(options.titleScore || 0),
          critical: Boolean(options.titleCritical),
        }] : [],
      },
    },
    thunder_hits: thunderHits,
    depression_hits: depressionHits,
    risk_unconfirmed: riskUnconfirmed,
    event_candidates: [],
    delta_relation: [],
  });
}

function createFixture(batchDir, fixture = {}) {
  ensureCleanDir(batchDir);
  const batchCount = Number(fixture.batchCount || 12);
  const commonOptions = fixture.commonOptions && typeof fixture.commonOptions === "object" ? fixture.commonOptions : {};
  const overrides = fixture.overrides && typeof fixture.overrides === "object" ? fixture.overrides : {};
  for (let index = 1; index <= batchCount; index += 1) {
    const perBatch = overrides[index] && typeof overrides[index] === "object"
      ? overrides[index]
      : (index === 6 && batchCount >= 6 ? { titleScore: 9, titleCritical: true, titleRule: "送女", titleMatched: "送女" } : {});
    createBatch(batchDir, index, { ...commonOptions, ...perBatch });
  }
}

function expectSameArray(actual, expected, label) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText === expectedText) ok(label);
  else fail(`${label} expected ${expectedText}, got ${actualText}`);
}

function runOpening100Scenario() {
  const batchDir = path.join(tmpRoot, "opening-100", "batches-all");
  const outputDir = path.join(tmpRoot, "opening-100", "batches-sampled");
  createFixture(batchDir);
  ok("prepared opening-100 sampling fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "dynamic",
    "--level", "medium",
    "--strategy", "risk-aware",
    "--coverage-template", "opening-100",
  ]);
  expectSuccess(result, "opening-100 sampling run");
  const selected = listSelectedBatchIds(outputDir);
  expectSameArray(selected, ["B01", "B02"], "opening-100 selects only early batches overlapping first 100 chapters");
  const batch = readJson(path.join(outputDir, "B01.json"));
  const note = Array.isArray(batch.metadata?.sample_selection?.notes) ? batch.metadata.sample_selection.notes[0] : null;
  if (note?.selection_label === "开篇窗口") ok("opening-100 annotates selected batch with opening-window note");
  else fail(`opening-100 should annotate opening-window note: ${JSON.stringify(batch.metadata?.sample_selection || {})}`);
}

function runHeadTailScenario() {
  const batchDir = path.join(tmpRoot, "head-tail", "batches-all");
  const outputDir = path.join(tmpRoot, "head-tail", "batches-sampled");
  createFixture(batchDir);
  ok("prepared head-tail sampling fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "dynamic",
    "--level", "medium",
    "--strategy", "risk-aware",
    "--coverage-template", "head-tail",
  ]);
  expectSuccess(result, "head-tail sampling run");
  const selected = listSelectedBatchIds(outputDir);
  expectSameArray(selected, ["B01", "B02", "B11", "B12"], "head-tail selects opening and tail windows");
}

function runHeadTailRiskScenario() {
  const batchDir = path.join(tmpRoot, "head-tail-risk", "batches-all");
  const outputDir = path.join(tmpRoot, "head-tail-risk", "batches-sampled");
  createFixture(batchDir);
  ok("prepared head-tail-risk sampling fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "fixed",
    "--count", "5",
    "--strategy", "risk-aware",
    "--coverage-template", "head-tail-risk",
  ]);
  expectSuccess(result, "head-tail-risk sampling run");
  const selected = listSelectedBatchIds(outputDir);
  if (selected.includes("B06")) ok("head-tail-risk supplements a mid-book hotspot batch");
  else fail(`head-tail-risk should include hotspot batch B06: ${JSON.stringify(selected)}`);
  const hotspot = readJson(path.join(outputDir, "B06.json"));
  const note = Array.isArray(hotspot.metadata?.sample_selection?.notes) ? hotspot.metadata.sample_selection.notes[0] : null;
  if (["热点补刀", "覆盖补位"].includes(note?.selection_label)) ok("head-tail-risk annotates a mid-book rescue note");
  else fail(`head-tail-risk should annotate a mid-book rescue note: ${JSON.stringify(hotspot.metadata?.sample_selection || {})}`);
}

function runHeadTailRiskDynamicRescueScenario() {
  const batchDir = path.join(tmpRoot, "head-tail-risk-dynamic-rescue", "batches-all");
  const outputDir = path.join(tmpRoot, "head-tail-risk-dynamic-rescue", "batches-sampled");
  createFixture(batchDir, {
    batchCount: 13,
    commonOptions: { riskRules: ["虐主"], depressionCount: 1 },
    overrides: {
      3: { titleScore: 4, depressionCount: 3 },
      4: { titleScore: 3, depressionCount: 5 },
      5: { titleScore: 12, titleCritical: true, titleRule: "送女", titleMatched: "送女", depressionCount: 2 },
      6: { depressionCount: 6 },
      7: { depressionCount: 7 },
      9: { depressionCount: 4 },
      10: { depressionCount: 2 },
    },
  });
  ok("prepared dynamic head-tail-risk rescue fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "dynamic",
    "--level", "medium",
    "--strategy", "risk-aware",
    "--coverage-template", "head-tail-risk",
  ]);
  expectSuccess(result, "dynamic head-tail-risk rescue run");
  const selected = listSelectedBatchIds(outputDir);
  if (selected.length === 9) ok("dynamic medium head-tail-risk lifts high-risk 13-batch fixture to nine samples");
  else fail(`dynamic medium head-tail-risk should select 9 batches on high-risk 13-batch fixture: ${JSON.stringify(selected)}`);
  if (selected.includes("B09")) ok("head-tail-risk coverage rescue reaches later middle corridor instead of only early hotspots");
  else fail(`head-tail-risk should include later corridor batch B09: ${JSON.stringify(selected)}`);
  const rescue = readJson(path.join(outputDir, "B09.json"));
  const rescueNote = Array.isArray(rescue.metadata?.sample_selection?.notes)
    ? rescue.metadata.sample_selection.notes.find((item) => item.selection_label === "覆盖补位")
    : null;
  if (rescueNote?.selection_role === "coverage-rescue") ok("head-tail-risk annotates coverage rescue note on later corridor fill");
  else fail(`head-tail-risk should annotate coverage rescue note on B09: ${JSON.stringify(rescue.metadata?.sample_selection || {})}`);
}

function runHeadTailRiskDynamicCount11Scenario() {
  const batchDir = path.join(tmpRoot, "head-tail-risk-dynamic-11", "batches-all");
  const outputDir = path.join(tmpRoot, "head-tail-risk-dynamic-11", "batches-sampled");
  createFixture(batchDir, {
    batchCount: 11,
    commonOptions: { riskRules: ["虐主"], depressionCount: 1 },
    overrides: {
      2: { titleScore: 10, titleCritical: true, titleRule: "送女", titleMatched: "送女" },
      4: { titleScore: 3, depressionCount: 4 },
      6: { depressionCount: 6 },
      7: { depressionCount: 5 },
      9: { depressionCount: 4 },
      10: { depressionCount: 6 },
    },
  });
  ok("prepared 11-batch dynamic head-tail-risk fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "dynamic",
    "--level", "medium",
    "--strategy", "risk-aware",
    "--coverage-template", "head-tail-risk",
  ]);
  expectSuccess(result, "dynamic 11-batch head-tail-risk run");
  const selected = listSelectedBatchIds(outputDir);
  if (selected.length === 8) ok("dynamic medium head-tail-risk lifts high-risk 11-batch fixture to eight samples");
  else fail(`dynamic medium head-tail-risk should select 8 batches on high-risk 11-batch fixture: ${JSON.stringify(selected)}`);
}

function runOpeningLatestScenario() {
  const batchDir = path.join(tmpRoot, "opening-latest", "batches-all");
  const outputDir = path.join(tmpRoot, "opening-latest", "batches-sampled");
  createFixture(batchDir);
  ok("prepared opening-latest sampling fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "dynamic",
    "--level", "medium",
    "--strategy", "risk-aware",
    "--coverage-template", "opening-latest",
    "--serial-status", "ongoing",
  ]);
  expectSuccess(result, "opening-latest sampling run");
  const selected = listSelectedBatchIds(outputDir);
  expectSameArray(selected, ["B01", "B02", "B12"], "opening-latest selects opening window plus latest-progress window");
  const latest = readJson(path.join(outputDir, "B12.json"));
  const note = Array.isArray(latest.metadata?.sample_selection?.notes) ? latest.metadata.sample_selection.notes[0] : null;
  if (note?.selection_label === "最新进度窗口") ok("opening-latest annotates latest-progress note");
  else fail(`opening-latest should annotate latest-progress note: ${JSON.stringify(latest.metadata?.sample_selection || {})}`);
}

function runOpeningLatestCompletedScenario() {
  const batchDir = path.join(tmpRoot, "opening-latest-completed", "batches-all");
  const outputDir = path.join(tmpRoot, "opening-latest-completed", "batches-sampled");
  createFixture(batchDir);
  ok("prepared opening-latest completed sampling fixture");
  const result = runNode("packages/saoshu-harem-review/scripts/sample_batches.mjs", [
    "--input", batchDir,
    "--output", outputDir,
    "--mode", "dynamic",
    "--level", "medium",
    "--strategy", "risk-aware",
    "--coverage-template", "opening-latest",
    "--serial-status", "completed",
  ]);
  expectSuccess(result, "opening-latest completed sampling run");
  const selected = listSelectedBatchIds(outputDir);
  expectSameArray(selected, ["B01", "B02", "B11", "B12"], "opening-latest on completed work selects opening plus ending window");
  const ending = readJson(path.join(outputDir, "B11.json"));
  const note = Array.isArray(ending.metadata?.sample_selection?.notes) ? ending.metadata.sample_selection.notes[0] : null;
  if (note?.selection_label === "结尾窗口") ok("opening-latest on completed work annotates ending-window note");
  else fail(`opening-latest completed should annotate ending-window note: ${JSON.stringify(ending.metadata?.sample_selection || {})}`);
}

function main() {
  ensureCleanDir(tmpRoot);
  runOpening100Scenario();
  runHeadTailScenario();
  runHeadTailRiskScenario();
  runHeadTailRiskDynamicRescueScenario();
  runHeadTailRiskDynamicCount11Scenario();
  runOpeningLatestScenario();
  runOpeningLatestCompletedScenario();
  if (!hasFailures()) console.log("Sampling template check passed.");
  else process.exitCode = 1;
}

main();
