#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheckHarness, createNodeCheckTestkit } from "../lib/check_testkit.mjs";
import { writeUtf8File } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const { ok, fail, expect, expectSuccess, hasFailures } = createCheckHarness();
const { ensureCleanDir, writeJson, readJson, runNode, assertExists } = createNodeCheckTestkit({ repoRoot, ok, fail });

const tmpRoot = path.join(repoRoot, ".tmp", "check-report-context-references");
const batchDir = path.join(tmpRoot, "batches");
const reviewDir = path.join(tmpRoot, "review-pack");
const novelTxt = path.join(tmpRoot, "novel.txt");
const dbDir = path.join(tmpRoot, "scan-db");
const reportMd = path.join(tmpRoot, "merged-report.md");
const reportHtml = path.join(tmpRoot, "merged-report.html");
const reportJson = path.join(tmpRoot, "merged-report.json");

ensureCleanDir(batchDir);
writeUtf8File(novelTxt, [
  "第一章 风波",
  "众人都说苏梨背叛林舟，可她似乎另有隐情。",
  "第二章 对质",
  "族老坚持要把苏梨送去和亲，林舟当场拒绝无果。",
].join("\n"));

writeJson(path.join(batchDir, "B01.json"), {
  batch_id: "B01",
  range: "第1-2章",
  events: ["第一章 风波", "第二章 对质"],
  metadata: {
    top_tags: [{ name: "后宫", count: 1 }],
    top_characters: [{ name: "苏梨", count: 2 }, { name: "林舟", count: 2 }],
    top_signals: [{ name: "事件:背叛:待补证", count: 1 }, { name: "事件:送女:已确认", count: 1 }],
  },
  thunder_hits: [],
  depression_hits: [],
  risk_unconfirmed: [{
    risk: "背叛",
    current_evidence: "流言称苏梨背叛林舟",
    missing_evidence: "需确认是否只是伪装投敌",
    impact: "若实锤将直接劝退",
  }],
  event_candidates: [{
    event_id: "E-PENDING",
    rule_candidate: "背叛",
    category: "risk",
    status: "待补证",
    review_decision: "待补证",
    certainty: "low",
    confidence_score: 4,
    chapter_range: "第1章",
    timeline: "mainline",
    polarity: "uncertain",
    subject: { name: "苏梨", relation_label: "未婚妻" },
    target: { name: "林舟", relation_label: "男主候选" },
    signals: ["背叛"],
    evidence: [{ chapter_num: 1, chapter_title: "第一章 风波", keyword: "背叛", snippet: "众人都说苏梨背叛林舟，可她似乎另有隐情。", offset_hint: 12 }],
    counter_evidence: ["片段中还有‘另有隐情’与误会暗示，不能直接当实锤。"],
    missing_evidence: ["需确认是否只是伪装投敌"],
  }, {
    event_id: "E-CONFIRMED",
    rule_candidate: "送女",
    category: "risk",
    status: "已确认",
    review_decision: "已确认",
    certainty: "high",
    confidence_score: 9,
    chapter_range: "第2章",
    timeline: "mainline",
    polarity: "affirmed",
    subject: { name: "苏梨", relation_label: "未婚妻" },
    target: { name: "林舟", relation_label: "男主候选" },
    signals: ["送女"],
    evidence: [{ chapter_num: 2, chapter_title: "第二章 对质", keyword: "送去", snippet: "族老坚持要把苏梨送去和亲，林舟当场拒绝无果。" }],
    missing_evidence: [],
  }],
  delta_relation: [],
});

const reviewRun = runNode("packages/saoshu-harem-review/scripts/review_contexts.mjs", [
  "--input", novelTxt,
  "--batches", batchDir,
  "--output", reviewDir,
  "--max-snippets", "2",
]);
expectSuccess(reviewRun, "review context reference run");
const reviewFile = path.join(reviewDir, "B01-review.md");
assertExists(reviewFile, "review pack");
const reviewMarkdown = fs.readFileSync(reviewFile, "utf8");
expect(reviewMarkdown.includes("引用1") && reviewMarkdown.includes("关键词 背叛") && reviewMarkdown.includes("众人都说苏梨背叛林舟"), "review pack renders context references", "review pack should render context references");

const mergeRun = runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
  "--input", batchDir,
  "--output", reportMd,
  "--json-out", reportJson,
  "--html-out", reportHtml,
  "--title", "上下文引用回归",
  "--author", "Codex",
  "--tags", "测试",
  "--target-defense", "布甲",
  "--pipeline-mode", "economy",
  "--coverage-mode", "sampled",
  "--coverage-template", "opening-100",
  "--total-batches", "4",
  "--selected-batches", "1",
  "--sample-coverage-rate", "0.25"
]);
expectSuccess(mergeRun, "report context reference merge run");

assertExists(reportJson, "report json");
assertExists(reportMd, "report markdown");
assertExists(reportHtml, "report html");

const report = readJson(reportJson);
const thunder = Array.isArray(report.thunder?.items) ? report.thunder.items.find((item) => item.rule === "送女") : null;
const risk = Array.isArray(report.risks_unconfirmed) ? report.risks_unconfirmed.find((item) => item.risk === "背叛") : null;
const pendingClue = Array.isArray(report.evidence_summary?.pending_clues) ? report.evidence_summary.pending_clues[0] : null;
const pendingEvent = Array.isArray(report.events?.items) ? report.events.items.find((item) => item.event_id === "E-PENDING") : null;

expect(Array.isArray(report.decision_summary?.supporting_references) && report.decision_summary.supporting_references.length > 0, "decision summary keeps supporting references", "decision summary should keep supporting references");
expect(Array.isArray(report.scan?.coverage_decision?.context_references) && report.scan.coverage_decision.context_references.length > 0, "coverage decision keeps upgrade references", "coverage decision should keep upgrade references");
expect(Array.isArray(thunder?.context_references) && thunder.context_references.some((item) => String(item.snippet || "").includes("把苏梨送去和亲")), "confirmed thunder keeps event context references", "confirmed thunder should keep event context references");
expect(Array.isArray(risk?.context_references) && risk.context_references.some((item) => String(item.snippet || "").includes("苏梨背叛林舟")), "unresolved risk keeps event context references", "unresolved risk should keep event context references");
expect(Array.isArray(pendingClue?.context_references) && pendingClue.context_references.length > 0, "pending clue keeps context references", "pending clue should keep context references");
expect(Array.isArray(pendingEvent?.context_references) && pendingEvent.context_references.some((item) => item.source_kind === "event_counter_evidence"), "event context references keep counter evidence", "event context references should keep counter evidence");
expect(Array.isArray(pendingEvent?.context_references) && pendingEvent.context_references.some((item) => Number(item.offset_hint) === 12), "event context references keep offset hint", "event context references should keep offset hint");

const markdown = fs.readFileSync(reportMd, "utf8");
expect(markdown.includes("结论佐证引用") && markdown.includes("升级佐证引用") && markdown.includes("还没坐实但值得盯的线索") && markdown.includes("引用1"), "markdown renders context reference sections", "markdown should render context reference sections");

const html = fs.readFileSync(reportHtml, "utf8");
expect(html.includes("结论佐证引用") && html.includes("升级佐证引用") && html.includes("还没坐实但值得盯的线索") && html.includes("众人都说苏梨背叛林舟"), "html renders context reference sections", "html should render context reference sections");

const ingestRun = runNode("packages/saoshu-scan-db/scripts/db_ingest.mjs", [
  "--db", dbDir,
  "--report", reportJson,
]);
expectSuccess(ingestRun, "db ingest keeps context references");
const riskRows = fs.readFileSync(path.join(dbDir, "risk_items.jsonl"), "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const riskRow = riskRows.find((item) => item.risk === "背叛");
expect(Array.isArray(riskRow?.context_references) && riskRow.context_references.some((item) => String(item.snippet || "").includes("苏梨背叛林舟")), "db risk row keeps context references", "db risk row should keep context references");

const contextOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "context-reference-overview", "--format", "json"]);
expectSuccess(contextOverview, "db_query context reference overview run");
const contextOverviewPayload = JSON.parse(contextOverview.stdout || "{}");
expect(Number(contextOverviewPayload.counter_reference_count || 0) >= 1 && Number(contextOverviewPayload.offset_hint_count || 0) >= 1, "db_query context reference overview keeps counter and offset stats", "db_query context reference overview should keep counter and offset stats");

const contextOverviewText = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "context-reference-overview", "--format", "text"]);
expectSuccess(contextOverviewText, "db_query context reference overview text run");
expect(
  contextOverviewText.stdout.includes("上下文引用总数：")
  && contextOverviewText.stdout.includes("反证引用数：")
  && contextOverviewText.stdout.includes("偏移定位引用数：")
  && contextOverviewText.stdout.includes("引用来源分布：")
  && contextOverviewText.stdout.includes("事件反证")
  && contextOverviewText.stdout.includes("引用归属分布：")
  && contextOverviewText.stdout.includes("覆盖升级建议")
  && contextOverviewText.stdout.includes("最近反证引用：")
  && contextOverviewText.stdout.includes("最近偏移定位引用："),
  "db_query context reference overview text keeps localized summary",
  `db_query context reference overview text should keep localized summary\nSTDOUT:\n${contextOverviewText.stdout}\nSTDERR:\n${contextOverviewText.stderr}`
);

const counterCandidates = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "counter-evidence-candidates", "--format", "json"]);
expectSuccess(counterCandidates, "db_query counter evidence candidates run");
const counterPayload = JSON.parse(counterCandidates.stdout || "[]");
expect(Array.isArray(counterPayload) && counterPayload.some((item) => String(item.source_kind || "") === "event_counter_evidence"), "db_query counter evidence candidates expose counter refs", "db_query counter evidence candidates should expose counter refs");

const contextRefs = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", dbDir, "--metric", "context-references", "--format", "json"]);
expectSuccess(contextRefs, "db_query context references run");
const contextRefPayload = JSON.parse(contextRefs.stdout || "[]");
expect(Array.isArray(contextRefPayload) && contextRefPayload.some((item) => Number(item.offset_hint) === 12), "db_query context references expose offset hint rows", "db_query context references should expose offset hint rows");

const dashboardPath = path.join(tmpRoot, "dashboard.html");
const dashboardRun = runNode("packages/saoshu-scan-db/scripts/db_dashboard.mjs", ["--db", dbDir, "--output", dashboardPath]);
expectSuccess(dashboardRun, "db_dashboard context reference run");
const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
expect(dashboardHtml.includes("上下文引用概览") && dashboardHtml.includes("反证引用") && dashboardHtml.includes("带偏移定位") && dashboardHtml.includes("事件反证"), "db_dashboard surfaces counter and offset context stats", "db_dashboard should surface counter and offset context stats");

if (!hasFailures()) console.log("Report context reference check passed.");
else process.exitCode = 1;
