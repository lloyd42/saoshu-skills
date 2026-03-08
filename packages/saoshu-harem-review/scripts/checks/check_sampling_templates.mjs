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
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [],
    delta_relation: [],
  });
}

function createFixture(batchDir) {
  ensureCleanDir(batchDir);
  for (let index = 1; index <= 12; index += 1) {
    createBatch(batchDir, index, index === 6 ? { titleScore: 9, titleCritical: true, titleRule: "送女", titleMatched: "送女" } : {});
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
  if (note?.selection_label === "热点补刀") ok("head-tail-risk annotates hotspot fill note");
  else fail(`head-tail-risk should annotate hotspot fill note: ${JSON.stringify(hotspot.metadata?.sample_selection || {})}`);
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
  runOpeningLatestScenario();
  runOpeningLatestCompletedScenario();
  if (!hasFailures()) console.log("Sampling template check passed.");
  else process.exitCode = 1;
}

main();