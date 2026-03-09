#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";
import { createNodeCheckContext } from "../lib/check_helpers.mjs";

const { repoRoot, ok, fail, ensureCleanDir, writeJson, readJson, runNode, expectSuccess, hasFailures } = createNodeCheckContext({ importMetaUrl: import.meta.url });
const tmpRoot = path.join(repoRoot, ".tmp", "check-relation-feedback-loop");

function prepareReportFixture(baseDir) {
  ensureCleanDir(baseDir);
  const dbDir = path.join(baseDir, "scan-db");
  const reportPath = path.join(baseDir, "merged-report.json");
  const report = {
    generated_at: new Date().toISOString(),
    novel: { title: "关系闭环样例", author: "Codex", tags: "测试", target_defense: "布甲" },
    overall: { verdict: "慎入", rating: 5 },
    scan: { batch_count: 1, sampling: { pipeline_mode: "performance", sample_mode: "fixed", sample_level_effective: "high", coverage_ratio: 1 } },
    metadata_summary: { top_tags: [{ name: "测试", count: 1 }], relationships: [] },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: [],
    events: {
      total_candidates: 1,
      confirmed: 0,
      excluded: 0,
      pending: 1,
      items: [
        {
          event_id: "背叛-b01-001",
          rule_candidate: "背叛",
          category: "risk",
          review_decision: "待补证",
          status: "高概率",
          subject: { name: "苏梨", relation_label: "未婚妻" },
          target: { name: "林舟", relation_label: "男主候选" },
          signals: ["背叛"],
          evidence: [{ snippet: "苏梨是林舟的未婚妻" }],
        },
      ],
    },
  };
  writeJson(reportPath, report);
  return { dbDir, reportPath };
}

function prepareBatchFixture(baseDir) {
  const batchDir = path.join(baseDir, "batches");
  fs.mkdirSync(batchDir, { recursive: true });
  writeJson(path.join(batchDir, "B01.json"), {
    batch_id: "B01",
    range: "第1-1章",
    events: ["第一章 关系"],
    metadata: { top_tags: [{ name: "测试", count: 1 }], top_characters: [{ name: "苏梨", count: 2 }, { name: "林舟", count: 1 }] },
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [],
    event_candidates: [
      {
        event_id: "背叛-b01-001",
        rule_candidate: "背叛",
        category: "risk",
        status: "高概率",
        review_decision: "待补证",
        certainty: "medium",
        confidence_score: 4,
        chapter_range: "第1-1章",
        timeline: "mainline",
        polarity: "uncertain",
        subject: { name: "苏梨", relation_label: "未婚妻", relation_confidence: 0.92 },
        target: { name: "林舟", relation_label: "男主候选", relation_confidence: 0.84 },
        signals: ["背叛"],
        evidence: [{ chapter_num: 1, chapter_title: "第一章 关系", keyword: "背叛", snippet: "苏梨是林舟的未婚妻" }],
      },
    ],
    delta_relation: [],
  });
  return { batchDir };
}

const fixture = prepareReportFixture(tmpRoot);
ok("prepared relation feedback report fixture");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_ingest.mjs", ["--db", fixture.dbDir, "--report", fixture.reportPath]), "relation candidate ingest run");

const relationCandidates = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", fixture.dbDir, "--metric", "relation-candidates", "--format", "json"]);
expectSuccess(relationCandidates, "relation candidate aggregation query run");
const relationRows = JSON.parse(relationCandidates.stdout || "[]");
if (Array.isArray(relationRows) && relationRows.some((item) => item.from === "苏梨" && item.to === "林舟" && item.type === "未婚妻")) ok("relation candidate aggregation keeps event-derived relation edge");
else fail("relation candidate aggregation should keep 苏梨 -> 林舟 -> 未婚妻");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_promote_relation.mjs", ["--db", fixture.dbDir, "--from", "苏梨", "--to", "林舟", "--type", "未婚妻", "--weight", "2", "--evidence", "人工确认关系边"]), "relation promotion record run");

const relationshipMapPath = path.join(tmpRoot, "relationship-map.json");
expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_export_relationship_map.mjs", ["--db", fixture.dbDir, "--output", relationshipMapPath]), "relationship map export run");
const relationshipMap = readJson(relationshipMapPath);
if (Array.isArray(relationshipMap.relationships) && relationshipMap.relationships.some((item) => item.from === "苏梨" && item.to === "林舟" && item.type === "未婚妻")) ok("exported relationship map includes promoted relation edge");
else fail("exported relationship map should include promoted relation edge");

const batchFixture = prepareBatchFixture(tmpRoot);
ok("prepared next-run relation merge fixture");
const mergedReportPath = path.join(tmpRoot, "merged-report.json");
const relationHtmlPath = path.join(tmpRoot, "relation-graph.html");
expectSuccess(runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
  "--input", batchFixture.batchDir,
  "--json-out", mergedReportPath,
  "--output", path.join(tmpRoot, "merged-report.md"),
  "--html-out", path.join(tmpRoot, "merged-report.html"),
  "--title", "关系闭环样例",
  "--author", "Codex",
  "--tags", "测试",
  "--target-defense", "布甲",
  "--relationship-map", relationshipMapPath,
]), "next-run merge with relationship map");

const mergedReport = readJson(mergedReportPath);
if (Array.isArray(mergedReport.metadata_summary?.relationships) && mergedReport.metadata_summary.relationships.some((item) => item.from === "苏梨" && item.to === "林舟" && item.type === "未婚妻")) ok("relationship map participates in next-run metadata_summary.relationships");
else fail("relationship map should participate in next-run metadata_summary.relationships");

expectSuccess(runNode("packages/saoshu-harem-review/scripts/relation_graph.mjs", ["--report", mergedReportPath, "--output", relationHtmlPath]), "relation graph run with promoted relationships");
const relationHtml = fs.readFileSync(relationHtmlPath, "utf8");
if (relationHtml.includes("未婚妻") && relationHtml.includes("苏梨") && relationHtml.includes("林舟")) ok("relation graph renders promoted relationship edge");
else fail("relation graph should render promoted relationship edge");

if (!hasFailures()) {
  console.log("Relation feedback loop check passed.");
} else {
  process.exitCode = 1;
}
