#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeUtf8File } from "../lib/text_output.mjs";
import { createCheckHarness, createNodeCheckTestkit } from "../lib/check_testkit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-event-review-focus");

const harness = createCheckHarness();
const { ok, fail, expectSuccess, hasFailures } = harness;
const toolkit = createNodeCheckTestkit({ repoRoot, ok, fail });
const { ensureCleanDir, writeJson, readJson, runNode } = toolkit;
function updateEventDecision(reviewPath, eventId, decision) {
  const content = fs.readFileSync(reviewPath, "utf8");
  const blocks = content.split(/(?=^### )/m);
  let updated = false;
  const next = blocks.map((block) => {
    if (updated) return block;
    if (!block.includes("[事件候选]") || !block.includes("事件ID：" + eventId)) return block;
    updated = true;
    return block.replace(/复核结论[:：]\s*待补证/g, `复核结论：${decision}`);
  }).join("");
  if (!updated) throw new Error(`event review block not found for ${eventId}`);
  writeUtf8File(reviewPath, next);
}

function prepareFixture(baseDir) {
  ensureCleanDir(baseDir);
  const inputPath = path.join(baseDir, "novel.txt");
  const batchDir = path.join(baseDir, "batches");
  const reviewDir = path.join(baseDir, "review-pack");
  const batchPath = path.join(batchDir, "B01.json");

  const novel = [
    "第一章 开局",
    "苏梨与林舟同行，众人都在议论背叛风波。",
    "第二章 误会",
    "苏梨解释自己并未背叛林舟，另一条背叛传闻则被证实是误会。",
    "",
  ].join("\n");
  writeUtf8File(inputPath, novel);

  const batch = {
    batch_id: "B01",
    range: "第1-2章",
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [
      {
        event_id: "背叛-b01-001",
        rule_candidate: "背叛",
        category: "risk",
        status: "已确认",
        certainty: "high",
        confidence_score: 7,
        review_decision: "",
        chapter_range: "第1-2章",
        timeline: "mainline",
        polarity: "affirmed",
        subject: { name: "苏梨", role_hint: "女主候选", relation_label: "未婚妻", relation_confidence: 0.92 },
        target: { name: "林舟", role_hint: "male_lead_candidate", relation_label: "男主候选", relation_confidence: 0.95 },
        signals: ["背叛"],
        evidence: [{ chapter_title: "第一章 开局", keyword: "背叛", snippet: "苏梨与林舟同行，众人都在议论背叛风波。" }],
        counter_evidence: [],
        missing_evidence: [],
        alternate_targets: [],
        conflict_notes: [],
      },
      {
        event_id: "背叛-b01-002",
        rule_candidate: "背叛",
        category: "risk",
        status: "已确认",
        certainty: "high",
        confidence_score: 7,
        review_decision: "",
        chapter_range: "第1-2章",
        timeline: "mainline",
        polarity: "affirmed",
        subject: { name: "苏梨", role_hint: "女主候选", relation_label: "未婚妻", relation_confidence: 0.92 },
        target: { name: "林舟", role_hint: "male_lead_candidate", relation_label: "男主候选", relation_confidence: 0.95 },
        signals: ["背叛"],
        evidence: [{ chapter_title: "第二章 误会", keyword: "背叛", snippet: "另一条背叛传闻则被证实是误会。" }],
        counter_evidence: ["片段中存在误会/未遂/假设类词汇"],
        missing_evidence: ["需人工确认是否排除"],
        alternate_targets: [],
        conflict_notes: [],
      },
    ],
  };
  writeJson(batchPath, batch);

  return { inputPath, batchDir, reviewDir, batchPath };
}

function runScenario() {
  const fixture = prepareFixture(tmpRoot);
  ok("prepared focused event-review fixture");

  const reviewResult = runNode("packages/saoshu-harem-review/scripts/review_contexts.mjs", [
    "--input", fixture.inputPath,
    "--batches", fixture.batchDir,
    "--output", fixture.reviewDir,
  ]);
  expectSuccess(reviewResult, "focused review_contexts run");

  const reviewPath = path.join(fixture.reviewDir, "B01-review.md");
  const reviewContent = fs.readFileSync(reviewPath, "utf8");
  if (reviewContent.includes("事件ID：背叛-b01-001") && reviewContent.includes("事件ID：背叛-b01-002")) ok("focused review pack keeps both event ids");
  else fail("focused review pack should keep both event ids");

  updateEventDecision(reviewPath, "背叛-b01-002", "排除");
  ok("updated one event block to explicit exclude");

  const applyResult = runNode("packages/saoshu-harem-review/scripts/apply_review_results.mjs", [
    "--batches", fixture.batchDir,
    "--reviews", fixture.reviewDir,
    "--accept-suggested",
  ]);
  expectSuccess(applyResult, "focused apply_review_results run");

  const batch = readJson(fixture.batchPath);
  const event1 = batch.event_candidates.find((item) => item.event_id === "背叛-b01-001");
  const event2 = batch.event_candidates.find((item) => item.event_id === "背叛-b01-002");

  if (event1?.review_decision === "已确认" && event1?.status === "已确认") ok("accept-suggested upgrades undecided event by event_id");
  else fail("accept-suggested should upgrade undecided event by event_id");

  if (event2?.review_decision === "排除" && event2?.status === "已排除") ok("explicit reviewer exclude overrides machine suggestion");
  else fail("explicit reviewer exclude should override machine suggestion");

  if (event1?.event_id !== event2?.event_id && event1?.review_decision !== event2?.review_decision) ok("same-rule events are updated independently by event_id");
  else fail("same-rule events should be updated independently by event_id");
}

runScenario();

if (!hasFailures()) {
  console.log("Focused event-review regression passed.");
} else {
  process.exitCode = 1;
}