#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheckHarness, createNodeCheckTestkit } from "./lib/check_testkit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-sampling-report-focus");

const harness = createCheckHarness();
const { ok, fail, expectSuccess, hasFailures } = harness;
const toolkit = createNodeCheckTestkit({ repoRoot, ok, fail });
const { ensureCleanDir, writeJson, readJson, runNode } = toolkit;
function createBatches(batchDir) {
  writeJson(path.join(batchDir, "B01.json"), {
    batch_id: "B01",
    range: "第1-80章",
    metadata: {
      source: "check-fixture",
      chapter_title_scan: { score: 0, critical: false, hit_chapter_count: 0, hits: [] },
      sample_selection: {
        coverage_template: "opening-latest",
        serial_status: "completed",
        notes: [{ selection_label: "开篇窗口", selection_detail: "覆盖前100章附近", selection_priority: 1, selection_role: "opening-window" }],
      },
    },
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [],
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
        serial_status: "completed",
        notes: [{ selection_label: "结尾窗口", selection_detail: "作品已标记为完结，因此优先覆盖结尾段", selection_priority: 2, selection_role: "ending-window" }],
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
  ok("prepared sampling report focus fixture");

  const reportJson = path.join(tmpRoot, "merged-report.json");
  const reportMd = path.join(tmpRoot, "merged-report.md");
  const reportHtml = path.join(tmpRoot, "merged-report.html");
  const result = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
    "--input", batchDir,
    "--output", reportMd,
    "--json-out", reportJson,
    "--html-out", reportHtml,
    "--title", "抽查报告聚焦",
    "--author", "公开夹具",
    "--target-defense", "布甲",
    "--pipeline-mode", "economy",
    "--coverage-mode", "sampled",
    "--coverage-template", "opening-latest",
    "--serial-status", "completed",
    "--sample-mode", "dynamic",
    "--sample-level", "auto",
    "--sample-level-effective", "medium",
    "--total-batches", "12",
    "--selected-batches", "2",
    "--sample-coverage-rate", (2 / 12).toFixed(6),
  ]);
  expectSuccess(result, "sampling report focus merge run");

  const report = readJson(reportJson);
  if (report.scan?.sampling?.coverage_gap_summary === "已看开篇与结尾，但中段长期演化未完整覆盖") ok("sampling report exposes structured coverage gap summary");
  else fail(`sampling report should expose coverage gap summary: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (Array.isArray(report.scan?.sampling?.coverage_gap_risk_types) && report.scan.sampling.coverage_gap_risk_types.includes("中段关系演化")) ok("sampling report exposes structured coverage gap risk types");
  else fail(`sampling report should expose coverage gap risk types: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("保守关注："))) ok("sampling report basis lines mention conservative risk mapping");
  else fail("sampling report should mention conservative risk mapping in basis lines");

  if (!hasFailures()) console.log("Sampling report focus check passed.");
  else process.exitCode = 1;
}

main();