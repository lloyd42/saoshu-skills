#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-batch-merge-focus");

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runNode(scriptPath, args = []) {
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
  try {
    const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ? String(error.stdout) : "",
      stderr: error.stderr ? String(error.stderr) : String(error.message || error),
    };
  }
}

function expectSuccess(result, label) {
  if (result.status === 0) ok(label);
  else fail(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function createFocusedBatches(batchDir) {
  const batch1 = {
    batch_id: "B01",
    range: "第1-10章",
    metadata: {
      top_tags: [{ name: "后宫", count: 2 }],
      top_characters: [{ name: "苏梨", count: 3 }, { name: "林舟", count: 2 }],
      chapter_title_scan: { score: 2, critical: false, hit_chapter_count: 1, hits: [{ chapter_num: 1, chapter_title: "第一章 开局", rule: "背叛", matched: "背叛", critical: false }] },
    },
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [
      {
        event_id: "背叛-b01-001",
        rule_candidate: "背叛",
        category: "risk",
        status: "已确认",
        certainty: "reviewed",
        confidence_score: 7,
        review_decision: "已确认",
        chapter_range: "第1-10章",
        timeline: "mainline",
        polarity: "negated",
        subject: { name: "苏梨", role_hint: "女主候选", relation_label: "未婚妻", relation_confidence: 0.92 },
        target: { name: "林舟", role_hint: "male_lead_candidate", relation_label: "男主候选", relation_confidence: 0.95 },
        signals: ["背叛"],
        evidence: [{ chapter_num: 1, keyword: "背叛", snippet: "苏梨并未背叛林舟" }],
        counter_evidence: ["片段中存在明确否定词"],
        missing_evidence: ["需确认事件是否真实发生而非误会/假设/未遂"],
        alternate_targets: [],
        conflict_notes: ["极性冲突:negated/uncertain"],
      },
    ],
  };

  const batch2 = {
    batch_id: "B02",
    range: "第11-12章",
    metadata: {
      top_tags: [{ name: "后宫", count: 1 }],
      top_characters: [{ name: "苏梨", count: 1 }],
      chapter_title_scan: { score: 1, critical: false, hit_chapter_count: 1, hits: [{ chapter_num: 12, chapter_title: "第十二章 澄清", rule: "背叛", matched: "背叛", critical: false }] },
    },
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [
      {
        event_id: "背叛-b02-002",
        rule_candidate: "背叛",
        category: "risk",
        status: "待补证",
        certainty: "low",
        confidence_score: 6,
        review_decision: "待补证",
        chapter_range: "第11-12章",
        timeline: "mainline",
        polarity: "uncertain",
        subject: { name: "未识别角色", role_hint: "unknown", relation_label: "未知", relation_confidence: 0.2 },
        target: { name: "未识别对象", role_hint: "unknown", relation_label: "未知", relation_confidence: 0.2 },
        signals: ["背叛"],
        evidence: [{ chapter_num: 12, keyword: "背叛", snippet: "苏梨说明主线里自己从未背叛林舟" }],
        counter_evidence: ["片段中存在误会/未遂/假设类词汇"],
        missing_evidence: ["需确认主体是否为女性核心角色"],
        alternate_targets: [],
        conflict_notes: [],
      },
    ],
  };

  writeJson(path.join(batchDir, "B01.json"), batch1);
  writeJson(path.join(batchDir, "B02.json"), batch2);
}

function runFocusedScenario() {
  ensureCleanDir(tmpRoot);
  const batchDir = path.join(tmpRoot, "batches");
  const reportJson = path.join(tmpRoot, "merged-report.json");
  const reportMd = path.join(tmpRoot, "merged-report.md");
  const reportHtml = path.join(tmpRoot, "merged-report.html");
  const glossary = path.join(repoRoot, "packages", "saoshu-term-wiki", "references", "glossary.json");

  createFocusedBatches(batchDir);
  ok("prepared focused batch-merge fixture");

  const result = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
    "--input", batchDir,
    "--output", reportMd,
    "--json-out", reportJson,
    "--html-out", reportHtml,
    "--title", "聚焦回归",
    "--author", "公开夹具",
    "--tags", "后宫/测试",
    "--target-defense", "布甲",
    "--pipeline-mode", "performance",
    "--wiki-dict", glossary,
  ]);
  expectSuccess(result, "focused batch_merge run");

  const report = readJson(reportJson);
  const betrayalEvents = Array.isArray(report?.events?.items) ? report.events.items.filter((item) => item.rule_candidate === "背叛") : [];
  if (betrayalEvents.length === 1) ok("focused merge deduplicates repeated betrayal events");
  else fail("focused merge should deduplicate repeated betrayal events");

  const merged = betrayalEvents[0] || {};
  if (Array.isArray(merged.batch_ids) && merged.batch_ids.length === 2) ok("focused merged event keeps both batch ids");
  else fail("focused merged event should keep both batch ids");
  if (Array.isArray(merged.source_event_ids) && merged.source_event_ids.length === 2) ok("focused merged event keeps source event ids");
  else fail("focused merged event should keep source event ids");
  if (merged.review_decision === "已确认") ok("focused merged event keeps confirmed decision precedence");
  else fail("focused merged event should keep confirmed decision precedence");

  const thunderItems = Array.isArray(report?.thunder?.items) ? report.thunder.items.filter((item) => item.rule === "背叛") : [];
  if (thunderItems.length === 1) ok("focused merge upgrades confirmed event into one thunder item");
  else fail("focused merge should upgrade confirmed event into one thunder item");

  const markdown = fs.readFileSync(reportMd, "utf8");
  if (markdown.includes("事件候选复核") && markdown.includes("背叛-b01-001")) ok("focused markdown render keeps merged event section");
  else fail("focused markdown render should keep merged event section");

  const html = fs.readFileSync(reportHtml, "utf8");
  if (html.includes("新手摘要卡") && html.includes("事件候选复核") && html.includes("苏梨 / 林舟")) ok("focused html render keeps summary and event table");
  else fail("focused html render should keep summary and event table");
}

runFocusedScenario();

if (!hasFailure) {
  console.log("Focused batch-merge regression passed.");
} else {
  process.exitCode = 1;
}
