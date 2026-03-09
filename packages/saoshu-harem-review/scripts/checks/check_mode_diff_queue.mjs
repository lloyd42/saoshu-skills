#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";
import { createNodeCheckContext, makeModeDiffFixtureReport } from "../lib/check_helpers.mjs";

const { repoRoot, ok, fail, writeJson, runNode, hasFailures } = createNodeCheckContext({ importMetaUrl: import.meta.url });
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-queue");

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const queuePath = path.join(tmpRoot, "queue.json");
const ledgerPath = path.join(tmpRoot, "mode-diff-ledger.jsonl");
const dbDir = path.join(tmpRoot, "scan-db");
const perfA = path.join(tmpRoot, "a-perf.json");
const econA = path.join(tmpRoot, "a-econ.json");
const perfB = path.join(tmpRoot, "b-perf.json");
const econB = path.join(tmpRoot, "b-econ.json");

writeJson(perfA, makeModeDiffFixtureReport({ title: "批量样本A", author: "作者甲", tags: ["玄幻"], pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
writeJson(econA, makeModeDiffFixtureReport({ title: "批量样本A", author: "作者甲", tags: ["玄幻"], pipelineMode: "economy", batchIds: ["B01", "B02", "B03"], totalBatches: 4, rating: 5, eventCount: 1, relationCount: 0 }));
writeJson(perfB, makeModeDiffFixtureReport({ title: "批量样本B", author: "作者乙", tags: ["都市"], pipelineMode: "performance", batchIds: ["B01", "B02", "B03", "B04"], totalBatches: 4, rating: 6, eventCount: 2, relationCount: 1 }));
writeJson(econB, makeModeDiffFixtureReport({ title: "批量样本B", author: "作者乙", tags: ["都市"], pipelineMode: "economy", batchIds: ["B01", "B02"], totalBatches: 4, rating: 4, eventCount: 1, relationCount: 0 }));

writeJson(queuePath, {
  ledger: ledgerPath,
  db: dbDir,
  jobs: [
    { name: "样本A", perf: perfA, econ: econA, out_dir: path.join(tmpRoot, "out", "a"), title: "批量样本A 模式对比" },
    { name: "样本B", perf: perfB, econ: econB, out_dir: path.join(tmpRoot, "out", "b"), title: "批量样本B 模式对比" },
  ],
});

const summaryOut = path.join(tmpRoot, "queue-summary.json");
const result = runNode("packages/saoshu-harem-review/scripts/mode_diff_queue_run.mjs", ["--queue", queuePath, "--out", summaryOut]);
if (result.status === 0) ok("mode_diff_queue_run batch run");
else fail(`mode_diff_queue_run batch run failed\nSTDERR:\n${result.stderr}`);

const summary = JSON.parse(fs.readFileSync(summaryOut, "utf8"));
if (summary.success === 2 && summary.failed === 0 && summary.sync?.status === "success") ok("mode_diff_queue_run records success summary and sync step");
else fail(`mode_diff_queue_run should report two successes and sync success: ${JSON.stringify(summary)}`);

const ledgerLines = fs.readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
if (ledgerLines.length === 2) ok("mode_diff_queue_run appends both jobs into ledger");
else fail(`mode_diff_queue_run should append two ledger entries: ${ledgerLines.length}`);

const mdPath = summaryOut.replace(/\.json$/i, ".md");
const htmlPath = summaryOut.replace(/\.json$/i, ".html");
if (fs.existsSync(mdPath) && fs.existsSync(htmlPath)) ok("mode_diff_queue_run writes markdown/html overview pages");
else fail("mode_diff_queue_run should write markdown/html overview pages");

if (fs.existsSync(path.join(tmpRoot, "mode-diff-summary", "mode-diff-ledger-summary.json")) && fs.existsSync(path.join(dbDir, "compare", "compare.json")) && fs.existsSync(path.join(dbDir, "trends", "trends.json")) && fs.existsSync(path.join(dbDir, "dashboard.html"))) ok("mode_diff_queue_run refreshes summary and db artifacts once batch finishes");
else fail("mode_diff_queue_run should refresh summary/db artifacts");

if (!hasFailures()) console.log("Mode diff queue check passed.");
else process.exitCode = 1;
