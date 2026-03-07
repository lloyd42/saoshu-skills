#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-db-compare-feedback-metrics");

let hasFailure = false;

function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
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

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const dbDir = path.join(tmpRoot, "scan-db");
const outDir = path.join(tmpRoot, "compare");

writeJsonl(path.join(dbDir, "runs.jsonl"), [
  { title: "A", author: "甲", tags: "后宫/玄幻", verdict: "慎入", rating: 5, thunder_total: 1, depression_total: 2, risk_total: 3, coverage_ratio: 0.8, keyword_candidate_total: 4, alias_candidate_total: 2, risk_question_candidate_total: 3, relation_candidate_total: 1 },
  { title: "B", author: "甲", tags: "后宫/都市", verdict: "可看", rating: 7, thunder_total: 0, depression_total: 1, risk_total: 1, coverage_ratio: 0.9, keyword_candidate_total: 6, alias_candidate_total: 4, risk_question_candidate_total: 2, relation_candidate_total: 5 },
]);

writeJsonl(path.join(dbDir, "mode_diff_entries.jsonl"), [
  { title: "A", author: "甲", tags: ["后宫", "玄幻"], gain_window: "gray", band: "enhance_economy", score: 4.5, coverage_ratio: 0.75 },
  { title: "B", author: "甲", tags: ["后宫", "都市"], gain_window: "too_wide", band: "fallback_to_performance", score: 8.2, coverage_ratio: 0.4 },
]);

const result = runNode("packages/saoshu-scan-db/scripts/db_compare.mjs", ["--db", dbDir, "--dimensions", "author,tags,mode_diff_gain_window", "--output-dir", outDir]);
if (result.status === 0) ok("db_compare feedback metrics run");
else fail(`db_compare feedback metrics run failed\nSTDERR:\n${result.stderr}`);

const jsonPath = path.join(outDir, "compare.json");
if (fs.existsSync(jsonPath)) ok("db_compare writes compare.json");
else fail("db_compare should write compare.json");

const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const authorGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "author") : null;
const row = Array.isArray(authorGroup?.rows) ? authorGroup.rows.find((item) => item.key === "甲") : null;
if (row?.avg_keyword_candidates === 5 && row?.avg_alias_candidates === 3 && row?.avg_risk_questions === 2.5 && row?.avg_relations === 3) ok("db_compare aggregates feedback asset metrics into averages");
else fail(`db_compare should aggregate feedback asset metrics: ${JSON.stringify(row)}`);

if (row?.mode_diff_entries === 2 && row?.gray_rate === 0.5 && row?.too_wide_rate === 0.5 && row?.avg_mode_diff_score === 6.35) ok("db_compare aggregates mode-diff metrics by author");
else fail(`db_compare should aggregate mode-diff metrics: ${JSON.stringify(row)}`);

const gainWindowGroup = Array.isArray(payload.groups) ? payload.groups.find((item) => item.dimension === "mode_diff_gain_window") : null;
const tooWideRow = Array.isArray(gainWindowGroup?.rows) ? gainWindowGroup.rows.find((item) => item.key === "too_wide") : null;
if (tooWideRow?.mode_diff_entries === 1 && tooWideRow?.too_wide_rate === 1) ok("db_compare supports mode_diff_gain_window dimension");
else fail(`db_compare should expose mode_diff_gain_window dimension: ${JSON.stringify(tooWideRow)}`);

if (!hasFailure) console.log("DB compare feedback metrics check passed.");
else process.exitCode = 1;