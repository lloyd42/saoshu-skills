#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-compare-reports-feedback-metrics");

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

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const perfPath = path.join(tmpRoot, "perf.json");
const econPath = path.join(tmpRoot, "econ.json");
const outDir = path.join(tmpRoot, "out");

writeJson(perfPath, {
  overall: { verdict: "慎入", rating: 5 },
  scan: { batch_count: 10, batch_ids: ["B01","B02","B03","B04"] },
  thunder: { total_candidates: 1, items: [] },
  depression: { total: 1, items: [] },
  risks_unconfirmed: [{ risk: "背叛", current_evidence: "流言" }],
  events: { items: [{ rule_candidate: "背叛", event_id: "E1", chapter_range: "第1章" }, { rule_candidate: "送女", event_id: "E2", chapter_range: "第2章" }] },
  follow_up_questions: ["Q1", "Q2", "Q3"],
  metadata_summary: { relationships: [{ from: "苏梨", to: "林舟", type: "未婚妻" }] },
});

writeJson(econPath, {
  overall: { verdict: "可看", rating: 7 },
  scan: { batch_count: 4, batch_ids: ["B01","B02"] },
  thunder: { total_candidates: 0, items: [] },
  depression: { total: 1, items: [] },
  risks_unconfirmed: [],
  events: { items: [{ rule_candidate: "背叛", event_id: "E1", chapter_range: "第1章" }] },
  follow_up_questions: ["Q1"],
  metadata_summary: { relationships: [] },
});

const result = runNode("packages/saoshu-harem-review/scripts/compare_reports.mjs", ["--perf", perfPath, "--econ", econPath, "--out-dir", outDir, "--title", "反馈指标对比"]);
if (result.status === 0) ok("compare_reports feedback metrics run");
else fail(`compare_reports feedback metrics run failed\nSTDERR:\n${result.stderr}`);

const jsonPath = path.join(outDir, "mode-diff.json");
if (fs.existsSync(jsonPath)) ok("compare_reports writes mode-diff.json");
else fail("compare_reports should write mode-diff.json");

const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const diff = payload.diff || {};
if (diff.perf_summary?.follow_up_count === 3 && diff.econ_summary?.follow_up_count === 1 && diff.differences?.only_in_performance?.relations?.length === 1) ok("compare_reports captures follow-up question and relation deltas");
else fail(`compare_reports should capture feedback deltas: ${JSON.stringify(diff)}`);

if (Array.isArray(payload.hints) && payload.hints.some((item) => String(item).includes("补证问题")) && payload.hints.some((item) => String(item).includes("关系边"))) ok("compare_reports emits user-facing hints for feedback gaps");
else fail(`compare_reports should emit feedback-gap hints: ${JSON.stringify(payload.hints)}`);

if (payload.assessment?.gain_window === "too_wide" && payload.assessment?.band === "fallback_to_performance" && String(payload.assessment?.third_mode_advice || "").includes("先增强现有模式")) ok("compare_reports emits user-centric gain-window assessment");
else fail(`compare_reports should emit gain-window assessment: ${JSON.stringify(payload.assessment)}`);

const reportMd = fs.readFileSync(path.join(outDir, "mode-diff.md"), "utf8");
if (reportMd.includes("高覆盖复核（兼容 performance）") && reportMd.includes("快速摸底（兼容 sampled/economy）")) ok("compare_reports markdown uses coverage-first framing for the two compared layers");
else fail("compare_reports markdown should use coverage-first framing for the two compared layers");

if (!hasFailure) console.log("Compare reports feedback metrics check passed.");
else process.exitCode = 1;
