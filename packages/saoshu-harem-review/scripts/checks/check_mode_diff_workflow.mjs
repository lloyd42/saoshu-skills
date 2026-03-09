#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";
import { createNodeCheckContext, makeModeDiffFixtureReport } from "../lib/check_helpers.mjs";

const { repoRoot, ok, fail, writeJson, runNode, hasFailures } = createNodeCheckContext({ importMetaUrl: import.meta.url });
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-workflow");

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const perfPath = path.join(tmpRoot, "perf.json");
const econPath = path.join(tmpRoot, "econ.json");
const compareOutDir = path.join(tmpRoot, "mode-diff", "sample-a");
const ledgerPath = path.join(tmpRoot, "mode-diff-ledger.jsonl");
const summaryDir = path.join(tmpRoot, "mode-diff-summary");
const dbDir = path.join(tmpRoot, "scan-db");

writeJson(perfPath, makeModeDiffFixtureReport({ title: "真实样本A", author: "作者甲", tags: ["玄幻", "后宫"], pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
writeJson(econPath, makeModeDiffFixtureReport({ title: "真实样本A", author: "作者甲", tags: ["玄幻", "后宫"], pipelineMode: "economy", batchIds: ["B01", "B02", "B03"], totalBatches: 4, rating: 5, eventCount: 1, relationCount: 0 }));

const record = runNode("packages/saoshu-harem-review/scripts/mode_diff_workflow.mjs", ["--perf", perfPath, "--econ", econPath, "--out-dir", compareOutDir, "--ledger", ledgerPath, "--summary-dir", summaryDir, "--db", dbDir, "--title", "真实样本A 模式对比"]);
if (record.status === 0) ok("mode_diff_workflow record run");
else fail(`mode_diff_workflow record run failed\nSTDERR:\n${record.stderr}`);

if (fs.existsSync(path.join(compareOutDir, "mode-diff.json")) && fs.existsSync(path.join(summaryDir, "mode-diff-ledger-summary.json"))) ok("mode_diff_workflow writes compare and summary outputs");
else fail("mode_diff_workflow should write compare and summary outputs");

if (fs.existsSync(path.join(dbDir, "mode_diff_entries.jsonl")) && fs.existsSync(path.join(dbDir, "compare", "compare.json")) && fs.existsSync(path.join(dbDir, "trends", "trends.json")) && fs.existsSync(path.join(dbDir, "dashboard.html"))) ok("mode_diff_workflow refreshes db compare/trends/dashboard outputs");
else fail("mode_diff_workflow should refresh db artifacts");

const comparePayload = JSON.parse(fs.readFileSync(path.join(dbDir, "compare", "compare.json"), "utf8"));
if (JSON.stringify(comparePayload.dimensions) === JSON.stringify(["author", "tags", "coverage_mode", "coverage_template", "coverage_decision_action", "coverage_decision_confidence", "coverage_decision_reason", "serial_status", "target_defense", "mode_diff_gain_window", "mode_diff_band"])) ok("mode_diff_workflow default compare dimensions prefer coverage-decision calibration");
else fail(`mode_diff_workflow should prefer coverage-decision calibration dimensions: ${JSON.stringify(comparePayload.dimensions)}`);

const modeDiffRows = fs.readFileSync(path.join(dbDir, "mode_diff_entries.jsonl"), "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const modeDiffRow = modeDiffRows[0] || {};
if (modeDiffRow.coverage_mode === "sampled"
  && modeDiffRow.coverage_template === "opening-latest"
  && modeDiffRow.coverage_decision_action === "upgrade-chapter-full"
  && Array.isArray(modeDiffRow.coverage_decision_reasons)
  && modeDiffRow.coverage_decision_reasons.includes("late_risk_uncovered")
  && modeDiffRow.serial_status === "ongoing") ok("mode_diff_workflow ingests economy coverage decision fields into mode-diff rows");
else fail(`mode_diff_workflow should ingest economy coverage decision fields: ${JSON.stringify(modeDiffRow)}`);

const actionGroup = Array.isArray(comparePayload.groups) ? comparePayload.groups.find((item) => item.dimension === "coverage_decision_action") : null;
const upgradeRow = Array.isArray(actionGroup?.rows) ? actionGroup.rows.find((item) => item.key === "upgrade-chapter-full") : null;
if (upgradeRow?.runs === 0 && upgradeRow?.mode_diff_entries === 1) ok("mode_diff_workflow compare output calibrates mode-diff by coverage decision action");
else fail(`mode_diff_workflow compare output should calibrate mode-diff by coverage decision action: ${JSON.stringify(upgradeRow)}`);

const sync = runNode("packages/saoshu-harem-review/scripts/mode_diff_workflow.mjs", ["--ledger", ledgerPath, "--summary-dir", summaryDir, "--db", dbDir]);
if (sync.status === 0) ok("mode_diff_workflow sync run");
else fail(`mode_diff_workflow sync run failed\nSTDERR:\n${sync.stderr}`);

const summaryPayload = JSON.parse(fs.readFileSync(path.join(summaryDir, "mode-diff-ledger-summary.json"), "utf8"));
if (summaryPayload.summary?.total_entries === 1) ok("mode_diff_workflow keeps ledger summary in sync");
else fail(`mode_diff_workflow should keep summary in sync: ${JSON.stringify(summaryPayload.summary)}`);

if (!hasFailures()) console.log("Mode diff workflow check passed.");
else process.exitCode = 1;
