#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createNodeCheckContext, makeModeDiffFixtureReport } from "../lib/check_helpers.mjs";

const { repoRoot, ok, fail, writeJson, runNode, hasFailures } = createNodeCheckContext({ importMetaUrl: import.meta.url });
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-discover");

fs.rmSync(tmpRoot, { recursive: true, force: true });
const root = path.join(tmpRoot, "reports");
writeJson(path.join(root, "book-a", "performance", "merged-report.json"), makeModeDiffFixtureReport({ title: "Book A", author: "作者", tags: ["示例"], batchIds: ["B01"], totalBatches: 1 }));
writeJson(path.join(root, "book-a", "economy", "merged-report.json"), makeModeDiffFixtureReport({ title: "Book A", author: "作者", tags: ["示例"], batchIds: ["B01"], totalBatches: 1 }));
writeJson(path.join(root, "book-b", "perf", "merged-report.json"), makeModeDiffFixtureReport({ title: "Book B", author: "作者", tags: ["示例"], batchIds: ["B01"], totalBatches: 1 }));
writeJson(path.join(root, "book-b", "econ", "merged-report.json"), makeModeDiffFixtureReport({ title: "Book B", author: "作者", tags: ["示例"], batchIds: ["B01"], totalBatches: 1 }));
writeJson(path.join(root, "book-c", "performance", "merged-report.json"), makeModeDiffFixtureReport({ title: "Book C", author: "作者", tags: ["示例"], batchIds: ["B01"], totalBatches: 1 }));

const queuePath = path.join(tmpRoot, "mode-diff-queue.json");
const result = runNode("packages/saoshu-harem-review/scripts/mode_diff_discover_queue.mjs", ["--root", root, "--output", queuePath, "--db", path.join(tmpRoot, "scan-db")]);
if (result.status === 0) ok("mode_diff_discover_queue run");
else fail(`mode_diff_discover_queue failed\nSTDERR:\n${result.stderr}`);

const payload = JSON.parse(fs.readFileSync(queuePath, "utf8"));
if (Array.isArray(payload.jobs) && payload.jobs.length === 2) ok("mode_diff_discover_queue finds matched perf/econ pairs only");
else fail(`mode_diff_discover_queue should find 2 jobs: ${JSON.stringify(payload)}`);

if (payload.jobs[0]?.out_dir && payload.jobs[0]?.perf && payload.jobs[0]?.econ) ok("mode_diff_discover_queue writes queue job paths");
else fail(`mode_diff_discover_queue should write queue job paths: ${JSON.stringify(payload.jobs?.[0])}`);

if (payload.db_compare_dimensions === "author,tags,coverage_mode,coverage_template,coverage_decision_action,coverage_decision_confidence,coverage_decision_reason,serial_status,target_defense,mode_diff_gain_window,mode_diff_band") ok("mode_diff_discover_queue defaults to coverage-first calibration dimensions");
else fail(`mode_diff_discover_queue should default to coverage-first calibration dimensions: ${JSON.stringify(payload.db_compare_dimensions)}`);

if (!hasFailures()) console.log("Mode diff discover check passed.");
else process.exitCode = 1;
