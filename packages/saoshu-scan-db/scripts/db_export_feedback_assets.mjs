#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File, writeUtf8Json } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log("Usage: node db_export_feedback_assets.mjs --db <dir> --output-dir <dir>");
}

function parseArgs(argv) {
  const out = { db: "", outputDir: "" };
  for (let index = 2; index < argv.length; index++) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--db") out.db = value, index++;
    else if (key === "--output-dir") out.outputDir = value, index++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.outputDir) throw new Error("--db and --output-dir are required");
  return out;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeUtf8Json(filePath, payload, { newline: true });
}

function runNodeScript(scriptName, args) {
  const scriptPath = path.join(scriptDir, scriptName);
  execFileSync(process.execPath, [scriptPath, ...args], { stdio: "pipe", encoding: "utf8" });
}

function fileSummary(relativePath, count, kind) {
  return { file: relativePath.replaceAll("\\", "/"), count, kind };
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push("# 反馈资产台账");
  lines.push("");
  lines.push(`- 生成时间：${summary.generated_at}`);
  lines.push(`- 数据库：${summary.db}`);
  lines.push("");
  lines.push("## 导出文件");
  for (const row of summary.exports) lines.push(`- ${row.kind}：${row.file}（${row.count}）`);
  lines.push("");
  lines.push("## 候选与晋升概览");
  lines.push(`- 关键词：候选 ${summary.counts.keyword_candidates} / 晋升 ${summary.counts.keyword_promotions}`);
  lines.push(`- 别名：候选 ${summary.counts.alias_candidates} / 晋升 ${summary.counts.alias_promotions}`);
  lines.push(`- 补证问题：候选 ${summary.counts.risk_question_candidates} / 晋升 ${summary.counts.risk_question_promotions}`);
  lines.push(`- 关系：候选 ${summary.counts.relation_candidates} / 晋升 ${summary.counts.relation_promotions}`);
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const dbDir = path.resolve(args.db);
  const outDir = path.resolve(args.outputDir);
  fs.mkdirSync(outDir, { recursive: true });

  const keywordRulesPath = path.join(outDir, "keyword-rules.json");
  const aliasMapPath = path.join(outDir, "alias-map.json");
  const riskQuestionPoolPath = path.join(outDir, "risk-question-pool.json");
  const relationshipMapPath = path.join(outDir, "relationship-map.json");

  runNodeScript("db_export_keyword_rules.mjs", ["--db", dbDir, "--output", keywordRulesPath]);
  runNodeScript("db_export_alias_map.mjs", ["--db", dbDir, "--output", aliasMapPath]);
  runNodeScript("db_export_risk_question_pool.mjs", ["--db", dbDir, "--output", riskQuestionPoolPath]);
  runNodeScript("db_export_relationship_map.mjs", ["--db", dbDir, "--output", relationshipMapPath]);

  const keywordRules = JSON.parse(fs.readFileSync(keywordRulesPath, "utf8"));
  const aliasMap = JSON.parse(fs.readFileSync(aliasMapPath, "utf8"));
  const riskQuestionPool = JSON.parse(fs.readFileSync(riskQuestionPoolPath, "utf8"));
  const relationshipMap = JSON.parse(fs.readFileSync(relationshipMapPath, "utf8"));

  const counts = {
    keyword_candidates: readJsonl(path.join(dbDir, "keyword_candidates.jsonl")).length,
    keyword_promotions: readJsonl(path.join(dbDir, "keyword_promotions.jsonl")).length,
    alias_candidates: readJsonl(path.join(dbDir, "alias_candidates.jsonl")).length,
    alias_promotions: readJsonl(path.join(dbDir, "alias_promotions.jsonl")).length,
    risk_question_candidates: readJsonl(path.join(dbDir, "risk_question_candidates.jsonl")).length,
    risk_question_promotions: readJsonl(path.join(dbDir, "risk_question_promotions.jsonl")).length,
    relation_candidates: readJsonl(path.join(dbDir, "relation_candidates.jsonl")).length,
    relation_promotions: readJsonl(path.join(dbDir, "relation_promotions.jsonl")).length,
  };

  const summary = {
    generated_at: new Date().toISOString(),
    db: dbDir.replaceAll("\\", "/"),
    counts,
    exports: [
      fileSummary(path.relative(outDir, keywordRulesPath), (keywordRules.thunder_strict?.length || 0) + (keywordRules.thunder_risk?.length || 0) + (keywordRules.depression_rules?.length || 0) + (keywordRules.title_signal_rules?.length || 0), "关键词规则"),
      fileSummary(path.relative(outDir, aliasMapPath), Array.isArray(aliasMap.aliases) ? aliasMap.aliases.length : 0, "角色别名映射"),
      fileSummary(path.relative(outDir, riskQuestionPoolPath), Array.isArray(riskQuestionPool.questions) ? riskQuestionPool.questions.length : 0, "补证问题池"),
      fileSummary(path.relative(outDir, relationshipMapPath), Array.isArray(relationshipMap.relationships) ? relationshipMap.relationships.length : 0, "关系映射"),
    ],
  };

  writeJson(path.join(outDir, "feedback-assets.json"), summary);
  writeUtf8File(path.join(outDir, "feedback-assets.md"), `${renderMarkdown(summary)}\n`);

  console.log(`Feedback assets exported: ${outDir}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
