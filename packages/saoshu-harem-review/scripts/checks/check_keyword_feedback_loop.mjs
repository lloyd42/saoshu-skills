#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";
import { createNodeCheckContext } from "../lib/check_helpers.mjs";

const { repoRoot, ok, fail, ensureCleanDir, writeJson, readJson, runNode, expectSuccess, hasFailures } = createNodeCheckContext({ importMetaUrl: import.meta.url });
const tmpRoot = path.join(repoRoot, ".tmp", "check-keyword-feedback-loop");

function prepareReportFixture(baseDir) {
  ensureCleanDir(baseDir);
  const dbDir = path.join(baseDir, "scan-db");
  const reportPath = path.join(baseDir, "merged-report.json");
  const report = {
    generated_at: new Date().toISOString(),
    novel: { title: "关键词闭环样例", author: "Codex", tags: "测试", target_defense: "布甲" },
    overall: { verdict: "慎入", rating: 5 },
    scan: { batch_count: 1, sampling: { pipeline_mode: "performance", sample_mode: "fixed", sample_level_effective: "high", coverage_ratio: 1 } },
    metadata_summary: { top_tags: [{ name: "测试", count: 1 }], top_signals: [{ name: "事件:送女:待补证", count: 1 }] },
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
          event_id: "送女-b01-001",
          rule_candidate: "送女",
          category: "risk",
          review_decision: "待补证",
          status: "待补证",
          chapter_range: "第1-1章",
          subject: { name: "苏梨" },
          target: { name: "林舟" },
          signals: ["献妻令"],
          evidence: [{ chapter_num: 1, chapter_title: "第一章", keyword: "献妻令", snippet: "敌军抛出献妻令，逼林舟把苏梨送给世子。" }],
        },
      ],
    },
  };
  writeJson(reportPath, report);
  return { dbDir, reportPath };
}

function prepareScanFixture(baseDir) {
  const inputPath = path.join(baseDir, "novel.txt");
  const outputDir = path.join(baseDir, "batches");
  const novel = [
    "第一章 逼婚",
    "苏梨是林舟的未婚妻。敌军亮出献妻令，逼林舟把苏梨送给北海世子。",
    "",
  ].join("\n");
  writeUtf8File(inputPath, novel);
  return { inputPath, outputDir };
}

const fixture = prepareReportFixture(tmpRoot);
ok("prepared keyword feedback report fixture");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_ingest.mjs", ["--db", fixture.dbDir, "--report", fixture.reportPath]), "keyword candidate ingest run");

const topKeywords = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", fixture.dbDir, "--metric", "top-keywords", "--format", "json"]);
expectSuccess(topKeywords, "keyword top query run");
const topKeywordsJson = JSON.parse(topKeywords.stdout || "[]");
if (Array.isArray(topKeywordsJson) && topKeywordsJson.some((item) => item.name === "献妻令")) ok("keyword ingest keeps new signal term");
else fail("keyword ingest should keep 献妻令");

const candidates = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", fixture.dbDir, "--metric", "keyword-candidates", "--format", "json"]);
expectSuccess(candidates, "keyword candidate aggregation query run");
const candidateRows = JSON.parse(candidates.stdout || "[]");
if (Array.isArray(candidateRows) && candidateRows.some((item) => item.keyword === "献妻令" && item.rule_candidate === "送女")) ok("keyword candidate aggregation keeps rule mapping");
else fail("keyword candidate aggregation should keep 送女 <- 献妻令");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_promote_keyword.mjs", ["--db", fixture.dbDir, "--keyword", "献妻令", "--rule", "送女", "--bucket", "thunder-risk", "--patterns", "献妻令,献妻", "--note", "人工确认后晋升" ]), "keyword promotion record run");

const exportedRulesPath = path.join(tmpRoot, "keyword-rules.json");
expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_export_keyword_rules.mjs", ["--db", fixture.dbDir, "--output", exportedRulesPath]), "keyword rules export run");

const exportedRules = readJson(exportedRulesPath);
if (Array.isArray(exportedRules.thunder_risk) && exportedRules.thunder_risk.some((item) => item.rule === "送女" && Array.isArray(item.patterns) && item.patterns.includes("献妻令"))) ok("exported keyword rules include promoted term");
else fail("exported keyword rules should include 献妻令 for 送女");

const scanFixture = prepareScanFixture(tmpRoot);
ok("prepared next-run scan fixture");
expectSuccess(runNode("packages/saoshu-harem-review/scripts/scan_txt_batches.mjs", ["--input", scanFixture.inputPath, "--output", scanFixture.outputDir, "--batch-size", "10", "--overlap", "0", "--keyword-rules", exportedRulesPath]), "next-run scan with exported keyword rules");

const batch = readJson(path.join(scanFixture.outputDir, "B01.json"));
if (Array.isArray(batch.risk_unconfirmed) && batch.risk_unconfirmed.some((item) => item.risk === "送女")) ok("promoted keyword participates in next-run risk detection");
else fail("promoted keyword should participate in next-run risk detection");

if (Array.isArray(batch.event_candidates) && batch.event_candidates.some((item) => item.rule_candidate === "送女" && Array.isArray(item.signals) && item.signals.includes("献妻令"))) ok("promoted keyword participates in next-run event candidate building");
else fail("promoted keyword should participate in next-run event candidate building");

if (!hasFailures()) {
  console.log("Keyword feedback loop check passed.");
} else {
  process.exitCode = 1;
}
