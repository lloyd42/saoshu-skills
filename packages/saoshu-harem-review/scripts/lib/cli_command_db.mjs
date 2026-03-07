import fs from "node:fs";
import path from "node:path";
import { getInstalledSkillPath, pushArg, runNodeScript, valueOf } from "./script_helpers.mjs";
import { failUsage, requireArg } from "./cli_feedback.mjs";

export function handleDb(rest, context) {
  const sub = rest[0] || "";
  const db = requireArg(valueOf(rest, "--db"), "db 缺少 `--db`", "示例：node saoshu_cli.mjs db overview --db ./scan-db");
  const dbRoot = getInstalledSkillPath("saoshu-scan-db", context.importMetaUrl);
  if (!fs.existsSync(dbRoot)) failUsage(`未找到数据库脚本目录：${dbRoot}`);
  if (sub === "overview") {
    const format = valueOf(rest, "--format", "text");
    return runNodeScript(path.join(dbRoot, "scripts/db_query.mjs"), ["--db", db, "--metric", "overview", "--format", format]);
  }
  if (sub === "dashboard") {
    const output = valueOf(rest, "--output");
    requireArg(output, "db dashboard 缺少 `--output`", "示例：node saoshu_cli.mjs db dashboard --db ./scan-db --output ./dashboard.html");
    return runNodeScript(path.join(dbRoot, "scripts/db_dashboard.mjs"), ["--db", db, "--output", output]);
  }
  if (sub === "trends") {
    const outputDir = valueOf(rest, "--output-dir", "");
    const top = valueOf(rest, "--top", "10");
    const args = ["--db", db, "--top", top];
    pushArg(args, "--output-dir", outputDir);
    return runNodeScript(path.join(dbRoot, "scripts/db_trends.mjs"), args);
  }
  if (sub === "ingest") {
    const report = requireArg(valueOf(rest, "--report"), "db ingest 缺少 `--report`", "示例：node saoshu_cli.mjs db ingest --db ./scan-db --report ./merged-report.json");
    const state = valueOf(rest, "--state", "");
    const manifest = valueOf(rest, "--manifest", "");
    const args = ["--db", db, "--report", report];
    pushArg(args, "--state", state);
    pushArg(args, "--manifest", manifest);
    return runNodeScript(path.join(dbRoot, "scripts/db_ingest.mjs"), args);
  }
  if (sub === "assets") {
    const outputDir = requireArg(valueOf(rest, "--output-dir"), "db assets 缺少 `--output-dir`", "示例：node saoshu_cli.mjs db assets --db ./scan-db --output-dir ./scan-db/assets");
    return runNodeScript(path.join(dbRoot, "scripts/db_export_feedback_assets.mjs"), ["--db", db, "--output-dir", outputDir]);
  }
  failUsage("db 子命令必须是 overview|trends|dashboard|ingest|assets", "示例：node saoshu_cli.mjs db overview --db ./scan-db");
}

export function handleCompare(rest, context) {
  const sub = rest[0] || "";
  if (sub === "ledger") {
    const ledger = requireArg(valueOf(rest, "--ledger"), "compare ledger 缺少 `--ledger`", "示例：node saoshu_cli.mjs compare ledger --ledger ./mode-diff-ledger.jsonl --output-dir ./workspace/mode-diff-summary");
    const outputDir = requireArg(valueOf(rest, "--output-dir"), "compare ledger 缺少 `--output-dir`", "示例：node saoshu_cli.mjs compare ledger --ledger ./mode-diff-ledger.jsonl --output-dir ./workspace/mode-diff-summary");
    const title = valueOf(rest, "--title", "mode-diff 台账汇总");
    const ledgerScript = path.join(getInstalledSkillPath("saoshu-harem-review", context.importMetaUrl), "scripts/mode_diff_ledger.mjs");
    if (!fs.existsSync(ledgerScript)) failUsage(`未找到台账汇总脚本：${ledgerScript}`);
    return runNodeScript(ledgerScript, ["--ledger", ledger, "--output-dir", outputDir, "--title", title]);
  }

  const db = requireArg(valueOf(rest, "--db"), "compare 缺少 `--db`", "示例：node saoshu_cli.mjs compare --db ./scan-db");
  const dimensions = valueOf(rest, "--dimensions", "author,tags,verdict,pipeline_mode,target_defense");
  const outputDir = valueOf(rest, "--output-dir", "");
  const top = valueOf(rest, "--top", "20");
  const compareScript = path.join(getInstalledSkillPath("saoshu-scan-db", context.importMetaUrl), "scripts/db_compare.mjs");
  if (!fs.existsSync(compareScript)) failUsage(`未找到对比脚本：${compareScript}`);
  const args = ["--db", db, "--dimensions", dimensions, "--top", top];
  pushArg(args, "--output-dir", outputDir);
  runNodeScript(compareScript, args);
}