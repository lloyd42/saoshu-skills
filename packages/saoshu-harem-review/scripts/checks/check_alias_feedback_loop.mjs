#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-alias-feedback-loop");

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
  writeUtf8Json(filePath, payload, { newline: true });
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

function prepareReportFixture(baseDir) {
  ensureCleanDir(baseDir);
  const dbDir = path.join(baseDir, "scan-db");
  const reportPath = path.join(baseDir, "merged-report.json");
  const report = {
    generated_at: new Date().toISOString(),
    novel: { title: "别名闭环样例", author: "Codex", tags: "测试", target_defense: "布甲" },
    overall: { verdict: "慎入", rating: 5 },
    scan: { batch_count: 1, sampling: { pipeline_mode: "performance", sample_mode: "fixed", sample_level_effective: "high", coverage_ratio: 1 } },
    metadata_summary: { top_tags: [{ name: "测试", count: 1 }] },
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
          status: "待补证",
          chapter_range: "第1-1章",
          subject: { name: "苏梨", alias_candidates: ["阿梨"] },
          target: { name: "林舟", alias_candidates: ["林公子"] },
          signals: ["背叛"],
          evidence: [{ chapter_num: 1, chapter_title: "第一章", keyword: "背叛", snippet: "阿梨并未背叛林公子。" }],
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
    "第一章 流言",
    "阿梨是林舟的未婚妻。众人都说阿梨背叛林公子，可她其实并未离开。",
    "",
  ].join("\n");
  writeUtf8File(inputPath, novel);
  return { inputPath, outputDir };
}

const fixture = prepareReportFixture(tmpRoot);
ok("prepared alias feedback report fixture");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_ingest.mjs", ["--db", fixture.dbDir, "--report", fixture.reportPath]), "alias candidate ingest run");

const aliasCandidates = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", fixture.dbDir, "--metric", "alias-candidates", "--format", "json"]);
expectSuccess(aliasCandidates, "alias candidate aggregation query run");
const aliasRows = JSON.parse(aliasCandidates.stdout || "[]");
if (Array.isArray(aliasRows) && aliasRows.some((item) => item.alias === "阿梨" && item.canonical_name === "苏梨")) ok("alias candidate aggregation keeps canonical mapping");
else fail("alias candidate aggregation should keep 苏梨 <- 阿梨");

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_promote_alias.mjs", ["--db", fixture.dbDir, "--canonical-name", "苏梨", "--alias", "阿梨", "--gender", "female", "--role-hint", "女主候选", "--relation-label", "未婚妻", "--note", "人工确认别名"]), "alias promotion record run");
expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_promote_alias.mjs", ["--db", fixture.dbDir, "--canonical-name", "林舟", "--alias", "林公子", "--gender", "male", "--role-hint", "male_lead_candidate", "--relation-label", "男主候选", "--note", "人工确认别名"]), "target alias promotion record run");

const aliasMapPath = path.join(tmpRoot, "alias-map.json");
expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_export_alias_map.mjs", ["--db", fixture.dbDir, "--output", aliasMapPath]), "alias map export run");
const aliasMap = readJson(aliasMapPath);
if (Array.isArray(aliasMap.aliases) && aliasMap.aliases.some((item) => item.canonical_name === "苏梨" && Array.isArray(item.aliases) && item.aliases.includes("阿梨"))) ok("exported alias map includes promoted subject alias");
else fail("exported alias map should include 苏梨 <- 阿梨");

const scanFixture = prepareScanFixture(tmpRoot);
ok("prepared next-run alias scan fixture");
expectSuccess(runNode("packages/saoshu-harem-review/scripts/scan_txt_batches.mjs", ["--input", scanFixture.inputPath, "--output", scanFixture.outputDir, "--batch-size", "10", "--overlap", "0", "--alias-map", aliasMapPath]), "next-run scan with alias map");

const batch = readJson(path.join(scanFixture.outputDir, "B01.json"));
const betrayal = Array.isArray(batch.event_candidates) ? batch.event_candidates.find((item) => item.rule_candidate === "背叛") : null;
if (betrayal?.subject?.name === "苏梨" && Array.isArray(betrayal?.subject?.alias_candidates) && betrayal.subject.alias_candidates.includes("阿梨")) ok("alias map normalizes subject name while preserving alias candidate");
else fail("alias map should normalize 阿梨 -> 苏梨 in event subject");

if (betrayal?.target?.name === "林舟") ok("alias map normalizes target alias");
else fail("alias map should normalize 林公子 -> 林舟 in event target");

if (Array.isArray(batch.metadata?.top_characters) && batch.metadata.top_characters.some((item) => item.name === "苏梨")) ok("alias map also normalizes top_characters summary");
else fail("alias map should normalize top_characters");

if (!hasFailure) {
  console.log("Alias feedback loop check passed.");
} else {
  process.exitCode = 1;
}
