#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-mode-diff-discover");

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

function makeReport(title) {
  return {
    novel: { title, author: "作者" },
    overall: { verdict: "待补证", rating: 6 },
    scan: { batch_count: 1, batch_ids: ["B01"], sampling: { pipeline_mode: "performance", coverage_ratio: 1 } },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: [],
    events: { items: [] },
    follow_up_questions: [],
    metadata_summary: { tags: ["示例"], relationships: [] },
  };
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
const root = path.join(tmpRoot, "reports");
writeJson(path.join(root, "book-a", "performance", "merged-report.json"), makeReport("Book A"));
writeJson(path.join(root, "book-a", "economy", "merged-report.json"), makeReport("Book A"));
writeJson(path.join(root, "book-b", "perf", "merged-report.json"), makeReport("Book B"));
writeJson(path.join(root, "book-b", "econ", "merged-report.json"), makeReport("Book B"));
writeJson(path.join(root, "book-c", "performance", "merged-report.json"), makeReport("Book C"));

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

if (!hasFailure) console.log("Mode diff discover check passed.");
else process.exitCode = 1;
