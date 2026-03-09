#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-report-view-structure");

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
const reportMd = path.join(tmpRoot, "merged-report.md");
const reportHtml = path.join(tmpRoot, "merged-report.html");
const reportJson = path.join(tmpRoot, "merged-report.json");
const readerPolicyPath = path.join(tmpRoot, "reader-policy.json");

writeJson(readerPolicyPath, {
  preset: "custom-accept-yuri-no-steal",
  label: "可接受百合但不能接受抢关键女主",
  source: "test",
  summary: "该视角接受百合，但不能接受关键女主被抢、共享或关系主位被改写。",
  hard_blocks: ["关键女主被抢"],
  soft_risks: ["百合"],
  relation_constraints: ["不能接受关键女主被抢/共享"],
  scope_rules: ["只把关键女主纳入一票否决"],
  evidence_threshold: "balanced",
  coverage_preference: "balanced",
  notes: ["仅用于报告视图回归"],
});

writeJson(path.join(batchDir, "B01.json"), {
  batch_id: "B01",
  range: "第1-2章",
  events: ["第一章 风波", "第二章 澄清"],
  metadata: { top_tags: [{ name: "后宫", count: 1 }], top_characters: [{ name: "苏梨", count: 2 }, { name: "林舟", count: 1 }], top_signals: [{ name: "事件:背叛:待补证", count: 1 }] },
  thunder_hits: [],
  depression_hits: [],
  risk_unconfirmed: [{ risk: "背叛", current_evidence: "流言称女主背叛男主", missing_evidence: "需确认终局是否真正离开男主阵营", impact: "若实锤将可能直接劝退" }],
  event_candidates: [{
    event_id: "E1",
    rule_candidate: "背叛",
    category: "risk",
    status: "待补证",
    review_decision: "待补证",
    certainty: "low",
    confidence_score: 3,
    chapter_range: "第1-2章",
    timeline: "mainline",
    polarity: "uncertain",
    subject: { name: "苏梨", relation_label: "未婚妻" },
    target: { name: "林舟", relation_label: "男主候选" },
    signals: ["背叛"],
    evidence: [{ chapter_num: 1, chapter_title: "第一章 风波", keyword: "背叛", snippet: "众人都说苏梨背叛林舟" }],
    missing_evidence: ["需确认是否只是伪装投敌"],
  }],
  delta_relation: [],
});

const result = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
  "--input", batchDir,
  "--output", reportMd,
  "--json-out", reportJson,
  "--html-out", reportHtml,
  "--title", "视图结构回归",
  "--author", "Codex",
  "--tags", "测试",
  "--target-defense", "布甲",
  "--pipeline-mode", "economy",
  "--coverage-mode", "sampled",
  "--reader-policy-file", readerPolicyPath,
  "--report-default-view", "newbie",
]);

if (result.status === 0) ok("report view structure merge run");
else fail(`report view structure merge run failed\nSTDERR:\n${result.stderr}`);

const markdown = fs.readFileSync(reportMd, "utf8");
if (markdown.includes("## ✅ 一眼结论") && markdown.includes("## 🔍 为什么这样判断") && markdown.includes("## ❓ 如果还不确定，先补这3个问题") && markdown.includes("## 🧠 深入查看")) ok("markdown groups content into decision evidence and deep-dive sections");
else fail("markdown should group content into decision/evidence/deep-dive sections");
if (markdown.includes("## 🎯 当前读者策略视角") && markdown.includes("可接受百合但不能接受抢关键女主")) ok("markdown renders reader policy view");
else fail("markdown should render reader policy view");

const html = fs.readFileSync(reportHtml, "utf8");
if (html.includes(">决策区<") && html.includes(">证据区<") && html.includes(">深入查看<")) ok("html renders decision evidence and deep-dive sections");
else fail("html should render decision/evidence/deep-dive sections");
if (html.includes(">当前读者策略视角<") && html.includes("可接受百合但不能接受抢关键女主")) ok("html renders reader policy view");
else fail("html should render reader policy view");

if (html.includes("body.view-newbie .expert-only{display:none}") && html.includes(">事件候选复核<") && html.includes("expert-only")) ok("html keeps expert sections collapsible in newbie view");
else fail("html should keep detailed sections hidden in newbie view");

if (html.includes(">覆盖口径<") && html.includes(">兼容执行层<") && html.indexOf(">覆盖口径<") < html.indexOf(">兼容执行层<")) ok("html hero shows coverage-first wording before compatibility layer");
else fail("html hero should show coverage-first wording before compatibility layer");

if (!hasFailure) console.log("Report view structure check passed.");
else process.exitCode = 1;
