import fs from "node:fs";
import path from "node:path";
import { appendArg, getInstalledSkillPath, quotePath, runCommand, valueOf } from "./script_helpers.mjs";
import { failUsage, requireArg } from "./cli_feedback.mjs";

export function handleDb(rest, context) {
  const sub = rest[0] || "";
  const db = requireArg(valueOf(rest, "--db"), "db 缺少 `--db`", "示例：node saoshu_cli.mjs db overview --db ./scan-db");
  const dbRoot = getInstalledSkillPath("saoshu-scan-db", context.importMetaUrl);
  if (!fs.existsSync(dbRoot)) failUsage(`未找到数据库脚本目录：${dbRoot}`);
  if (sub === "overview") {
    const format = valueOf(rest, "--format", "text");
    return runCommand(`node ${quotePath(path.join(dbRoot, "scripts/db_query.mjs"))} --db ${quotePath(db)} --metric overview --format ${format}`);
  }
  if (sub === "dashboard") {
    const output = valueOf(rest, "--output");
    requireArg(output, "db dashboard 缺少 `--output`", "示例：node saoshu_cli.mjs db dashboard --db ./scan-db --output ./dashboard.html");
    return runCommand(`node ${quotePath(path.join(dbRoot, "scripts/db_dashboard.mjs"))} --db ${quotePath(db)} --output ${quotePath(output)}`);
  }
  if (sub === "trends") {
    const outputDir = valueOf(rest, "--output-dir", "");
    const top = valueOf(rest, "--top", "10");
    let cmdLine = `node ${quotePath(path.join(dbRoot, "scripts/db_trends.mjs"))} --db ${quotePath(db)} --top ${top}`;
    cmdLine = appendArg(cmdLine, "--output-dir", outputDir);
    return runCommand(cmdLine);
  }
  if (sub === "ingest") {
    const report = requireArg(valueOf(rest, "--report"), "db ingest 缺少 `--report`", "示例：node saoshu_cli.mjs db ingest --db ./scan-db --report ./merged-report.json");
    const state = valueOf(rest, "--state", "");
    const manifest = valueOf(rest, "--manifest", "");
    let cmdLine = `node ${quotePath(path.join(dbRoot, "scripts/db_ingest.mjs"))} --db ${quotePath(db)} --report ${quotePath(report)}`;
    cmdLine = appendArg(cmdLine, "--state", state);
    cmdLine = appendArg(cmdLine, "--manifest", manifest);
    return runCommand(cmdLine);
  }
  failUsage("db 子命令必须是 overview|trends|dashboard|ingest", "示例：node saoshu_cli.mjs db overview --db ./scan-db");
}

export function handleCompare(rest, context) {
  const db = requireArg(valueOf(rest, "--db"), "compare 缺少 `--db`", "示例：node saoshu_cli.mjs compare --db ./scan-db");
  const dimensions = valueOf(rest, "--dimensions", "author,tags,verdict,pipeline_mode,target_defense");
  const outputDir = valueOf(rest, "--output-dir", "");
  const top = valueOf(rest, "--top", "20");
  const compareScript = path.join(getInstalledSkillPath("saoshu-scan-db", context.importMetaUrl), "scripts/db_compare.mjs");
  if (!fs.existsSync(compareScript)) failUsage(`未找到对比脚本：${compareScript}`);
  let cmdLine = `node ${quotePath(compareScript)} --db ${quotePath(db)} --dimensions ${quotePath(dimensions)} --top ${top}`;
  cmdLine = appendArg(cmdLine, "--output-dir", outputDir);
  runCommand(cmdLine);
}
