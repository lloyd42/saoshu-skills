#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-report-priority-focus");

let hasFailure = false;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

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

ensureCleanDir(tmpRoot);
const batchDir = path.join(tmpRoot, "batches");
const reportJson = path.join(tmpRoot, "merged-report.json");
const questionPoolPath = path.join(tmpRoot, "risk-question-pool.json");
const readerPolicyPath = path.join(tmpRoot, "reader-policy.json");

writeJson(questionPoolPath, {
  questions: [
    { risk: "背叛", questions: ["背叛是否只是伪装投敌，终局是否回到男主阵营？"] },
    { risk: "擦边", questions: ["擦边是否最终越界成实质雷点？"] },
  ],
});

writeJson(readerPolicyPath, {
  preset: "custom-no-steal",
  label: "不能接受关键女主被抢",
  source: "test",
  summary: "该视角重点关注关键女主被抢、共享或关系主位被改写。",
  hard_blocks: ["送女"],
  soft_risks: [],
  relation_constraints: ["不能接受关键女主被抢/共享"],
  scope_rules: [],
  evidence_threshold: "balanced",
  coverage_preference: "balanced",
  notes: [],
});

writeJson(path.join(batchDir, "B01.json"), {
  batch_id: "B01",
  range: "第1-3章",
  events: ["第一章", "第二章", "第三章"],
  metadata: { top_tags: [{ name: "后宫", count: 1 }], top_characters: [{ name: "苏梨", count: 2 }], top_signals: [] },
  thunder_hits: [],
  depression_hits: [],
  risk_unconfirmed: [
    { risk: "擦边", current_evidence: "多次暧昧接触", missing_evidence: "需确认是否最终越界", impact: "可能降低观感" },
    { risk: "背叛", current_evidence: "流言称女主叛变", missing_evidence: "需确认终局是否真正离开男主阵营", impact: "若实锤将显著下调结论并可能直接劝退" },
  ],
  event_candidates: [
    { event_id: "E1", rule_candidate: "背叛", category: "risk", status: "待补证", review_decision: "待补证", confidence_score: 6, chapter_range: "第1章", timeline: "mainline", polarity: "uncertain", subject: { name: "苏梨" }, target: { name: "林舟" }, evidence: [{ snippet: "流言称她背叛林舟" }], missing_evidence: ["需确认是否只是伪装投敌"] },
    { event_id: "E2", rule_candidate: "擦边", category: "risk", status: "待补证", review_decision: "待补证", confidence_score: 2, chapter_range: "第2章", timeline: "mainline", polarity: "uncertain", subject: { name: "苏梨" }, target: { name: "林舟" }, evidence: [{ snippet: "两人频繁暧昧" }], missing_evidence: ["需确认是否最终越界"] },
    { event_id: "E3", rule_candidate: "送女", category: "risk", status: "待补证", review_decision: "待补证", confidence_score: 5, chapter_range: "第3章", timeline: "mainline", polarity: "uncertain", subject: { name: "苏梨" }, target: { name: "林舟" }, evidence: [{ snippet: "敌军想逼男主送女" }], missing_evidence: ["需确认是否真实发生而非威胁"] },
  ],
  delta_relation: [],
});

const result = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
  "--input", batchDir,
  "--json-out", reportJson,
  "--output", path.join(tmpRoot, "merged-report.md"),
  "--html-out", path.join(tmpRoot, "merged-report.html"),
  "--title", "优先级回归",
  "--author", "Codex",
  "--tags", "测试",
  "--target-defense", "布甲",
  "--risk-question-pool", questionPoolPath,
  "--reader-policy-file", readerPolicyPath,
]);

if (result.status === 0) ok("report priority merge run");
else fail(`report priority merge run failed\nSTDERR:\n${result.stderr}`);

const report = JSON.parse(fs.readFileSync(reportJson, "utf8"));
const risks = Array.isArray(report.risks_unconfirmed) ? report.risks_unconfirmed : [];
if (risks[0]?.risk === "背叛") ok("unresolved risks are prioritized by likely conclusion impact");
else fail(`expected 背叛 to rank first, got ${risks[0]?.risk || "(none)"}`);

const questions = Array.isArray(report.follow_up_questions) ? report.follow_up_questions : [];
if (questions.length === 3) ok("follow-up questions are limited to the top three");
else fail(`expected exactly 3 follow-up questions, got ${questions.length}`);

if (questions[0]?.includes("送女")) ok("reader policy elevates hard-block relation question to first");
else fail(`expected 送女 question first under reader policy, got ${questions[0] || "(none)"}`);

if (!hasFailure) console.log("Report priority focus check passed.");
else process.exitCode = 1;
