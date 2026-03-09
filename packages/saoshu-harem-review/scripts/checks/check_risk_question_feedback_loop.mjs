#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";
import { createNodeCheckContext } from "../lib/check_helpers.mjs";

const { repoRoot, ok, fail, ensureCleanDir, writeJson, readJson, runNode, expectSuccess, hasFailures } = createNodeCheckContext({ importMetaUrl: import.meta.url });
const tmpRoot = path.join(repoRoot, ".tmp", "check-risk-question-feedback-loop");

function prepareReportFixture(baseDir) {
  ensureCleanDir(baseDir);
  const dbDir = path.join(baseDir, "scan-db");
  const reportPath = path.join(baseDir, "merged-report.json");
  const report = {
    generated_at: new Date().toISOString(),
    novel: { title: "补证问题闭环样例", author: "Codex", tags: "测试", target_defense: "布甲" },
    overall: { verdict: "慎入", rating: 5 },
    scan: { batch_count: 1, sampling: { pipeline_mode: "performance", sample_mode: "fixed", sample_level_effective: "high", coverage_ratio: 1 } },
    metadata_summary: { top_tags: [{ name: "测试", count: 1 }] },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: [
      {
        risk: "背叛",
        current_evidence: "流言称女主背叛男主",
        missing_evidence: "需确认终局是否真正离开男主阵营",
        impact: "若实锤将可能直接劝退",
      },
    ],
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
          status: "待补证",
          signals: ["背叛"],
          evidence: [{ snippet: "众人都说她背叛了林舟" }],
          missing_evidence: ["需确认是否只是伪装投敌"],
        },
      ],
    },
    follow_up_questions: ["[背叛] 当前未证实风险项对应章节能否提供明确片段？"],
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
    events: ["第一章 流言"],
    thunder_hits: [],
    depression_hits: [],
    risk_unconfirmed: [
      {
        risk: "背叛",
        current_evidence: "流言称女主背叛男主",
        missing_evidence: "需确认终局是否真正离开男主阵营",
        impact: "若实锤将可能直接劝退",
      },
    ],
    event_candidates: [
      {
        event_id: "背叛-b01-001",
        rule_candidate: "背叛",
        category: "risk",
        status: "待补证",
        review_decision: "待补证",
        certainty: "low",
        confidence_score: 2,
        chapter_range: "第1-1章",
        timeline: "mainline",
        polarity: "uncertain",
        subject: { name: "苏梨" },
        target: { name: "林舟" },
        signals: ["背叛"],
        evidence: [{ chapter_num: 1, chapter_title: "第一章 流言", keyword: "背叛", snippet: "众人都说她背叛了林舟" }],
        missing_evidence: ["需确认是否只是伪装投敌"],
      },
    ],
    delta_relation: [],
  });
  return { batchDir };
}

const fixture = prepareReportFixture(tmpRoot);
ok("prepared risk-question report fixture");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_ingest.mjs", ["--db", fixture.dbDir, "--report", fixture.reportPath]), "risk-question candidate ingest run");

const candidates = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", fixture.dbDir, "--metric", "risk-question-candidates", "--format", "json"]);
expectSuccess(candidates, "risk-question candidate aggregation query run");
const candidateRows = JSON.parse(candidates.stdout || "[]");
if (Array.isArray(candidateRows) && candidateRows.some((item) => item.risk === "背叛" && item.question === "需确认终局是否真正离开男主阵营")) ok("risk question candidate aggregation keeps unresolved risk question");
else fail("risk question candidate aggregation should keep unresolved risk question");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_promote_risk_question.mjs", ["--db", fixture.dbDir, "--risk", "背叛", "--question", "背叛是否只是伪装投敌，终局是否回到男主阵营？", "--note", "人工整理后的标准补证问题"]), "risk question promotion record run");

const poolPath = path.join(tmpRoot, "risk-question-pool.json");
expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_export_risk_question_pool.mjs", ["--db", fixture.dbDir, "--output", poolPath]), "risk question pool export run");
const pool = readJson(poolPath);
if (Array.isArray(pool.questions) && pool.questions.some((item) => item.risk === "背叛" && Array.isArray(item.questions) && item.questions.includes("背叛是否只是伪装投敌，终局是否回到男主阵营？"))) ok("exported risk question pool includes promoted question");
else fail("exported risk question pool should include promoted question");

const batchFixture = prepareBatchFixture(tmpRoot);
ok("prepared next-run merge fixture");
const mergeReportPath = path.join(tmpRoot, "merged-report.json");
expectSuccess(runNode("packages/saoshu-harem-review/scripts/batch_merge.mjs", [
  "--input", batchFixture.batchDir,
  "--json-out", mergeReportPath,
  "--output", path.join(tmpRoot, "merged-report.md"),
  "--html-out", path.join(tmpRoot, "merged-report.html"),
  "--title", "补证问题闭环样例",
  "--author", "Codex",
  "--tags", "测试",
  "--target-defense", "布甲",
  "--risk-question-pool", poolPath,
]), "next-run merge with risk question pool");

const mergedReport = readJson(mergeReportPath);
if (Array.isArray(mergedReport.follow_up_questions) && mergedReport.follow_up_questions.includes("背叛是否只是伪装投敌，终局是否回到男主阵营？")) ok("risk question pool participates in next-run follow-up question generation");
else fail("risk question pool should participate in next-run follow-up question generation");

if (!hasFailures()) {
  console.log("Risk-question feedback loop check passed.");
} else {
  process.exitCode = 1;
}
